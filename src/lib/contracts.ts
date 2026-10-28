import { z } from 'zod';
import { TASTE_GOAL_IDS } from './taste-goals.ts';
export const scoreSchema = z.number().min(0).max(1);
export const weightsSchema = z.object({ food: scoreSchema, taste: scoreSchema, value: scoreSchema, proximity: scoreSchema, service: scoreSchema, atmosphere: scoreSchema });
export type Weights = z.infer<typeof weightsSchema>;
export const evidenceSchema = z.object({ id: z.string(), aspect: z.enum(['food','value','service','atmosphere','cleanliness','fusion']), text: z.string().max(600), sourceUrl: z.string().url() });
export const featuresSchema = z.object({ foodQuality: scoreSchema.nullable(), value: scoreSchema.nullable(), service: scoreSchema.nullable(), atmosphere: scoreSchema.nullable(), cuisines: z.array(z.string()), dishes: z.array(z.string()), foodTypes: z.array(z.string().max(60)).max(30).optional(), flavors: z.array(z.string()), spice: scoreSchema.nullable(), fusion: z.boolean(), reviewCount: z.number().int().nonnegative(), confidence: scoreSchema, evidence: z.array(evidenceSchema), updatedAt: z.string() });
export type RestaurantFeatures = z.infer<typeof featuresSchema>;
export const restaurantSchema = z.object({ id: z.string(), name: z.string(), address: z.string(), city: z.string(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), cuisines: z.array(z.string()), listingCategories: z.array(z.string().max(100)).max(40).optional(), foodTypes: z.array(z.string().max(60)).max(30).optional(), priceLevel: z.number().int().min(1).max(4).nullable(), priceText: z.string().max(100).nullable().optional(), googleRating: z.number().min(0).max(5).nullable(), reviewCount: z.number().int().nonnegative(), sourceUrl: z.string().url(), imageUrl: z.string().url().nullable(), websiteUrl: z.string().url().nullable(), hours: z.array(z.string()), isClosed: z.boolean(), fetchedAt: z.string(), features: featuresSchema.nullable() });
export type Restaurant = z.infer<typeof restaurantSchema>;
export const favoriteSchema = z.object({ restaurantId: z.string().max(300), name: z.string().min(1).max(200), city: z.string().max(150), reasons: z.array(z.string().max(100)).max(10), notes: z.string().max(1500) }).refine(f => f.reasons.length > 0 || f.notes.trim().length > 0, { message: 'Tell us what you like about each restaurant.' });
export type Favorite = z.infer<typeof favoriteSchema>;
export const tasteInputSchema = z.object({ favorites: z.array(favoriteSchema).min(1).max(5), correction: z.string().max(1500).optional(), goal: z.enum(TASTE_GOAL_IDS).optional() });
export type TasteInput = z.infer<typeof tasteInputSchema>;
export const tasteProfileSchema = z.object({ version: z.number().int().positive(), weights: weightsSchema, cuisines: z.array(z.string()).max(30), dishes: z.array(z.string()).max(30), flavors: z.array(z.string()).max(30), spicePreference: scoreSchema.nullable(), fusionPreference: scoreSchema.nullable(), interpretation: z.string().max(1200), updatedAt: z.string() });
export type TasteProfile = z.infer<typeof tasteProfileSchema>;
export const locationSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type Location = z.infer<typeof locationSchema>;
export const savedLocationSchema = locationSchema.extend({ label: z.string().trim().min(1).max(700) }).strict();
export type SavedLocation = z.infer<typeof savedLocationSchema>;
export const discoverInputSchema = locationSchema.extend({ searchId: z.string().uuid().optional(), radiusKm: z.number().min(0.5).max(50).default(5), mode: z.enum(['for-you','fusion']).default('for-you'), query: z.string().max(150).default(''), cuisine: z.string().max(80).default(''), foodType: z.string().max(60).optional(), maxPrice: z.number().int().min(1).max(4).optional() });
export type DiscoverInput = z.infer<typeof discoverInputSchema>;
export interface RankedRestaurant { restaurant: Restaurant; score: number; distanceKm: number; explanation: string; confidence: number; matchReasons?: string[]; scoreBreakdown?: { food: number|null; value: number|null; service: number|null; atmosphere: number|null; taste: number|null } }
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'budget_limited' | 'uncertain';
export interface RefreshJob { id: string; status: JobState; kind: 'discovery' | 'details' | 'favorite-search'; createdAt: string; error?: string }
export interface Review { id: string; text: string; stars: number | null; publishedAt: string | null; sourceUrl: string }
export interface DiscoverResponse { items: RankedRestaurant[]; job: RefreshJob | null; enrichmentJob?: RefreshJob | null; searchPhase?: 'places' | 'reviews' | 'complete'; profileVersion: number; dataMode: 'live' | 'demo'; refreshing: boolean; warning?: string }
