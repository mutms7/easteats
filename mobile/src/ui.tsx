import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextProps, type TextInputProps } from 'react-native';
export const brand = '#E12D12';
export function T({ style, ...props }: TextProps) { return <Text {...props} style={[s.text, style]} />; }
export function Button({ title, onPress, disabled, secondary = false, selected, destructive = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; selected?: boolean; destructive?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, selected && s.selected, disabled && s.disabled, pressed && { opacity: .7 }, destructive && { backgroundColor: '#9B1B07' }]}><T style={[s.buttonText, secondary && { color: '#191919' }]}>{title}</T></Pressable>;
}
export function Field({ label, style, ...props }: TextInputProps & { label: string }) { return <View style={s.field}><T style={s.label}>{label}</T><TextInput accessibilityLabel={label} placeholderTextColor="#747474" {...props} style={[s.input, style]} /></View>; }
export function Title({ children }: PropsWithChildren) { return <T accessibilityRole="header" style={s.title}>{children}</T>; }
export const s = StyleSheet.create({
  text: { fontFamily: 'Jakarta', fontSize: 16, lineHeight: 24, color: '#191919' },
  safe: { flex: 1, backgroundColor: '#FFFFFF' }, body: { padding: 22, paddingBottom: 40, gap: 18 },
  header: { paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#EEEEEE' },
  wordmark: { fontSize: 28, lineHeight: 38, fontWeight: '800', color: brand, letterSpacing: -1.2 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -1.2, fontWeight: '800' },
  subtitle: { color: '#626262', fontSize: 16, lineHeight: 25 },
  sectionTitle: { fontWeight: '800', fontSize: 21, lineHeight: 28 },
  button: { borderRadius: 999, backgroundColor: brand, minHeight: 50, paddingHorizontal: 22, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center', fontSize: 15, lineHeight: 23 },
  secondary: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E5E5E5' }, selected: { backgroundColor: '#FFF0EC', borderColor: brand }, disabled: { opacity: .45 },
  field: { gap: 7 }, label: { fontSize: 14, fontWeight: '700' },
  input: { fontFamily: 'Jakarta', fontSize: 16, lineHeight: 24, minHeight: 52, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 13, padding: 14, color: '#191919', backgroundColor: '#FAFAFA' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 20, padding: 18, gap: 12 },
  small: { fontSize: 13, lineHeight: 20, color: '#626262' }, notice: { backgroundColor: '#FFF0EC', padding: 14, borderRadius: 13 },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, gap: 4, borderTopWidth: 1, borderColor: '#EEEEEE' },
  tab: { flex: 1, minHeight: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 999 }, tabText: { fontSize: 13, lineHeight: 20, fontWeight: '700' },
  photo: { width: '100%', height: 190, borderRadius: 14, backgroundColor: '#F5F5F5' },
  divider: { height: 1, backgroundColor: '#EEEEEE', marginVertical: 4 },
});
