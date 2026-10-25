import {describe,it,expect} from 'vitest';
import {tasteInputSchema,discoverInputSchema} from '@/lib/contracts';
import {checkOrigin} from '@/server/http';
describe('API boundaries',()=>{
 it('requires a reason for every favorite',()=>expect(tasteInputSchema.safeParse({favorites:[{restaurantId:'a',name:'Noodles',city:'Berkeley',notes:'',reasons:[]}]}).success).toBe(false));
 it('bounds coordinates and radius',()=>{expect(discoverInputSchema.safeParse({lat:91,lng:0}).success).toBe(false);expect(discoverInputSchema.safeParse({lat:37,lng:-122,radiusKm:100}).success).toBe(false);});
 it('rejects cross-site writes',()=>expect(()=>checkOrigin(new Request('http://localhost:3000/api/taste',{headers:{origin:'https://attacker.example'}}))).toThrow());
});
