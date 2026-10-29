import { ScrollView, View } from 'react-native';
import { CUISINES, FOOD_TYPES } from '../../src/lib/food-taxonomy';
import { Button, Field, s, T } from './ui';
export function SearchOptions({query,cuisine,foodType,radius,onQuery,onCuisine,onFoodType,onRadius}:{query:string;cuisine:string;foodType:string;radius:number;onQuery:(value:string)=>void;onCuisine:(value:string)=>void;onFoodType:(value:string)=>void;onRadius:(value:number)=>void}) {
  return <View style={{gap:12}}>
    <Field label="What sounds good?" value={query} onChangeText={onQuery} placeholder="Noodles, sushi, a restaurant name..." maxLength={150} />
    <T style={s.label}>Cuisine</T><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}><Button title="Any cuisine" secondary selected={!cuisine} onPress={()=>onCuisine('')} />{CUISINES.map(value=><Button key={value} title={value} secondary selected={cuisine===value} onPress={()=>onCuisine(value)} />)}</ScrollView>
    <T style={s.label}>Food type</T><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}><Button title="Any food" secondary selected={!foodType} onPress={()=>onFoodType('')} />{FOOD_TYPES.map(food=><Button key={food.id} title={food.label} secondary selected={foodType===food.id} onPress={()=>onFoodType(food.id)} />)}</ScrollView>
    <T style={s.label}>Distance</T><View style={s.wrap}>{[2,5,15].map(value=><Button key={value} title={`${value} km`} secondary selected={radius===value} onPress={()=>onRadius(value)} />)}</View>
  </View>;
}
