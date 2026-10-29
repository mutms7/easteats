import { ApifyClient, type ApifyRun, type ScrapeInput } from '../../../src/server/data/apify.ts';
import { normalizePlace } from '../../../src/server/data/normalize.ts';
import type { RestaurantFeatures, Review } from '../../../src/lib/contracts.ts';

export type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export interface QueueJob { id: string; status: string; kind: string; input: ScrapeInput; run_id: string | null; dataset_id: string | null; reservation_id: string | null; cursor_offset: number; }
export interface WorkerDependencies {
  rpc: Rpc; apify: Pick<ApifyClient, 'start' | 'getRun' | 'dataset'>;
  extract: (reviews: Review[], options: { apiKey: string; model: string; timeoutMs?: number; onUsage: (u: { model: string; inputTokens: number; outputTokens: number }) => Promise<void> }) => Promise<RestaurantFeatures>;
  anthropicKey?: string; extractModel: string; extractionVersion: string; webhookUrl?: string; webhookSecret?: string;
}
export async function rpcValue<T>(rpc: Rpc, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rpc(name,args); if (result.error) throw new Error(`Database operation failed: ${name}`); return result.data as T;
}
async function update(rpc: Rpc, id: string, status: string, rest: Record<string, unknown> = {}) { await rpcValue(rpc,'update_refresh_job',{p_id:id,p_status:status,...rest}); }
export async function safeSecretEqual(actual: string | null, expected: string | undefined): Promise<boolean> {
  if (!actual || !expected) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [a,b] = await Promise.all([digest(actual),digest(expected)]); let different=0; for (let i=0;i<a.length;i++) different|=a[i]^b[i]; return different===0;
}
export async function sourceHash(reviews: Review[], version: string, model: string): Promise<string> {
  const source=JSON.stringify({ reviews: [...reviews].sort((a,b)=>a.id.localeCompare(b.id)), version, model });
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function extractionCost(u: { model: string; inputTokens: number; outputTokens: number }): number {
  const rates: Record<string,[number,number]> = {'claude-haiku-5-5':[.1,.5],'claude-haiku-4-5-20251001':[1,5]};
  const rate=u.model==='claude-haiku-5-5'&&u.inputTokens>100_000?[.5,2.5]:rates[u.model]; if (!rate) throw new Error('Extraction model pricing is not configured');
  return (u.inputTokens*rate[0]+u.outputTokens*rate[1])/1_000_000;
}

/** One small durable page per call, safe to invoke from cron or an authenticated kick. */
export async function processRefreshJobs(deps: WorkerDependencies): Promise<{ processed: number; failed: number }> {
  const { rpc, apify }=deps;
  const jobs=await rpcValue<QueueJob[]>(rpc,'claim_refresh_jobs',{p_limit:1});
  let processed=0,failed=0;
  jobLoop: for (const job of jobs) {
    const favoriteSearch=job.kind==='favorite-search';
    const discovery=job.kind==='discovery';
    const businessSearch=favoriteSearch||discovery;
    try {
      // A details job cannot complete analysis without an extraction provider.
      // Fail before launching a paid scrape rather than silently discarding it.
      if (!businessSearch && !deps.anthropicKey) throw new Error('Review extraction is not configured');
      if (!job.run_id) {
        const reservation=await rpcValue<string|null>(rpc,'reserve_usage',{p_provider:'apify',p_operation:`refresh:${job.id}`,p_reserved_usd:1});
        if (!reservation) { await update(rpc,job.id,'budget_limited',{p_error:'Refresh budget reached'}); continue; }
        await update(rpc,job.id,'starting',{p_reservation_id:reservation});
        // Never retry an ambiguous start. Reservation remains held until reconciled.
        try {
          const run=await apify.start({...job.input,maxPlaces:favoriteSearch?5:20,maxReviews:businessSearch?0:40},1,deps.webhookUrl,deps.webhookSecret);
          await update(rpc,job.id,'running',{p_run_id:run.id,p_dataset_id:run.defaultDatasetId});
        } catch { await update(rpc,job.id,'uncertain',{p_error:'Launch outcome unknown; manual reconciliation required'}); failed++; }
        processed++; continue;
      }
      const run=await apify.getRun(job.run_id);
      if (run.id!==job.run_id) throw new Error('Run ownership mismatch');
      if (['FAILED','TIMED-OUT','ABORTED'].includes(run.status)) {
        if (job.reservation_id && Number.isFinite(run.usageTotalUsd)) await rpcValue(rpc,'settle_usage',{p_id:job.reservation_id,p_actual_usd:run.usageTotalUsd});
        await update(rpc,job.id,'failed',{p_error:'Restaurant source refresh failed'}); failed++; continue;
      }
      const completed=run.status==='SUCCEEDED';
      // Discovery and favorite lookup publish business matches immediately.
      // Separate details jobs retain review analysis without blocking search.
      const datasetId=run.defaultDatasetId||job.dataset_id;
      if (!completed && (!businessSearch||!datasetId||!['READY','RUNNING'].includes(run.status))) { await update(rpc,job.id,'running'); continue; }
      if (!datasetId) throw new Error('Restaurant source dataset is unavailable');
      if (completed && job.reservation_id && Number.isFinite(run.usageTotalUsd)) await rpcValue(rpc,'settle_usage',{p_id:job.reservation_id,p_actual_usd:run.usageTotalUsd});
      const pageSize=favoriteSearch?5:discovery?20:1;
      const rows=await apify.dataset(datasetId,job.cursor_offset,pageSize);
      let offset=job.cursor_offset;
      for (const row of rows) {
        const place=normalizePlace(row);
        if (place) {
          await rpcValue(rpc,'ingest_place',{p_record:place.restaurant,p_reviews:businessSearch?[]:place.reviews});
          // Preserve the provider's match set so dish/name searches need not
          // rediscover their results through a local full-string name filter.
          if (businessSearch) await rpcValue(rpc,'record_search_place',{p_job_id:job.id,p_place_id:place.restaurant.id});
          if (!businessSearch && place.reviews.length && deps.anthropicKey) {
            const hash=await sourceHash(place.reviews,deps.extractionVersion,deps.extractModel);
            const cached=await rpcValue<{sourceHash:string;features:RestaurantFeatures}|null>(rpc,'get_cached_features',{p_place_id:place.restaurant.id});
            if (cached?.sourceHash!==hash) {
              // Refuse unknown model prices before making a paid call.
              extractionCost({model:deps.extractModel,inputTokens:0,outputTokens:0});
              const reservation=await rpcValue<string|null>(rpc,'reserve_usage',{p_provider:'anthropic',p_operation:`extract:${job.id}:${offset}:${crypto.randomUUID()}`,p_reserved_usd:deps.extractModel==='claude-haiku-4-5-20251001'?.50:.10});
              if (!reservation) {
                // Keep the cursor on this restaurant so it is never reported
                // as analyzed when the model budget prevented extraction.
                await update(rpc,job.id,'budget_limited',{p_error:'Review analysis budget reached'});
                failed++;
                continue jobLoop;
              }
              if (reservation) {
                let totalCost=0,usageReports=0;
                // Hold the full reservation until every concurrent chunk has completed.
                // A timeout or invalid partial batch must not release unknown provider spend.
                const features=await deps.extract(place.reviews,{apiKey:deps.anthropicKey,model:deps.extractModel,timeoutMs:25_000,onUsage:async u=>{totalCost+=extractionCost(u);usageReports++;}});
                if (usageReports>0) await rpcValue(rpc,'settle_usage',{p_id:reservation,p_actual_usd:totalCost});
                await rpcValue(rpc,'put_features',{p_place_id:place.restaurant.id,p_features:features,p_source_hash:hash});
              }
            } else if (cached?.features) {
              await rpcValue(rpc,'put_features',{p_place_id:place.restaurant.id,p_features:{...cached.features,updatedAt:new Date().toISOString()},p_source_hash:hash});
            }
          }
        }
        offset++;
        await update(rpc,job.id,completed?'ingesting':'running',{p_offset:offset});
      }
      let finished=completed&&rows.length<pageSize;
      // A full business page should not wait another minute merely to find EOF.
      if (businessSearch&&completed&&rows.length===pageSize) finished=(await apify.dataset(datasetId,offset,1)).length===0;
      await update(rpc,job.id,finished?'succeeded':completed?'ingesting':'running',{p_offset:offset});
      processed++;
    } catch (error) {
      const message=(error instanceof Error?error.message:'Unknown processing failure').slice(0,300).replace(/(?:sk-ant-|apify_api_|sb_secret_)[A-Za-z0-9_-]+/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
      console.error('Refresh processing error:',message);
      const code=error!==null&&typeof error==='object'&&'code' in error?String(error.code):'';
      const safeCode=code==='INVALID_RESPONSE'?'MODEL_INVALID_RESPONSE':code==='PROVIDER'?'PROVIDER':message.startsWith('Database operation failed:')?'DATABASE':'UNKNOWN';
      await rpcValue(rpc,'retry_refresh_job',{p_id:job.id});
      await rpcValue(rpc,'record_refresh_error',{p_id:job.id,p_code:safeCode});
      failed++;
    }
    finally { await rpcValue(rpc,'release_refresh_job',{p_id:job.id}); }
  }
  await rpcValue(rpc,'prune_review_evidence');
  return {processed,failed};
}

/** Authenticate first in the HTTP handler. Callback payloads cannot choose a dataset. */
export async function reconcileWebhook(runId: string, deps: Pick<WorkerDependencies,'rpc'|'apify'>): Promise<boolean> {
  const job=await rpcValue<QueueJob|null>(deps.rpc,'get_job_by_run',{p_run_id:runId});
  if (!job) return false;
  if (['succeeded','failed','budget_limited'].includes(job.status)) return true;
  const run: ApifyRun=await deps.apify.getRun(runId);
  if (run.id!==job.run_id) throw new Error('Run ownership mismatch');
  if (job.reservation_id && Number.isFinite(run.usageTotalUsd) && ['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(run.status)) await rpcValue(deps.rpc,'settle_usage',{p_id:job.reservation_id,p_actual_usd:run.usageTotalUsd});
  if (run.status==='SUCCEEDED') await update(deps.rpc,job.id,'ingesting',{p_dataset_id:run.defaultDatasetId});
  else if (['FAILED','TIMED-OUT','ABORTED'].includes(run.status)) await update(deps.rpc,job.id,'failed',{p_error:'Restaurant source refresh failed'});
  return true;
}
