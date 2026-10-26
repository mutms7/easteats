import {it,expect} from 'vitest';
import {rankAreas} from '@/server/geocoding';
it('ranks the requested city above a similarly named street elsewhere',()=>{
 const results=[{label:'University Avenue, Fredericton, New Brunswick, Canada',lat:45.95,lng:-66.63},{label:'University Avenue, Waterloo, Ontario, Canada',lat:43.517834,lng:-80.517859},{label:'University Avenue, Cedar Falls, Iowa',lat:42.51,lng:-92.44}];
 expect(rankAreas('University Avenue Waterloo',results)[0]).toEqual(results[1]);expect(results[0].label).toContain('Fredericton');
});
