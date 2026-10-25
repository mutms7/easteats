process.loadEnvFile('.env.local');
if(process.env.ANTHROPIC_API_KEY){
 const r=await fetch('https://api.anthropic.com/v1/models?limit=100',{headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:AbortSignal.timeout(15000)});
 console.log('Anthropic credential check:',r.status);
 if(r.ok){const data=await r.json();console.log('Available models:',data.data?.map(m=>m.id).join(', '));}
}
if(process.env.APIFY_TOKEN){const r=await fetch('https://api.apify.com/v2/users/me',{headers:{Authorization:`Bearer ${process.env.APIFY_TOKEN}`},signal:AbortSignal.timeout(15000)});console.log('Apify credential check:',r.status);}
