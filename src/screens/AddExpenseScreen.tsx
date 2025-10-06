import React, { useContext, useState } from 'react';
import { View, TextInput, Button, Text, Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { AppContext } from '@/navigation/AppNavigator';

export default function AddExpenseScreen() {
  const { projectId } = useContext(AppContext);
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { data: categories } = useQuery({
    enabled: !!projectId,
    queryKey: ['categories', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_categories', { p_project_id: projectId });
      if (error) throw error;
      return data as Array<{ id: string; name: string }>; 
    }
  });

  const submit = async () => {
    if (!projectId) return Alert.alert('Pick a project first');
    const amt = parseFloat(amount);
    if (!amt || !categoryId) return Alert.alert('Enter amount and choose category');
    const { error } = await supabase.from('expenses').insert({ amount: amt, project_id: projectId, category_id: categoryId, spent_at: date, note });
    if (error) return Alert.alert('Error', error.message);
    setAmount(''); setNote('');
    qc.invalidateQueries();
    Alert.alert('Saved', 'Expense added');
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontWeight: '600' }}>Add Expense</Text>
      <TextInput placeholder="Amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
      <TextInput placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
      <Text style={{ fontWeight: '600' }}>Category</Text>
      <View style={{ gap: 6 }}>
        {categories?.map((c) => (
          <Text key={c.id} onPress={() => setCategoryId(c.id)} style={{ padding: 8, borderWidth: 1, borderRadius: 8, backgroundColor: categoryId === c.id ? '#e5e7eb' : 'transparent' }}>
            {c.name}
          </Text>
        ))}
      </View>
      <TextInput placeholder="Note (optional)" value={note} onChangeText={setNote} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
      <Button title="Save" onPress={submit} />
    </View>
  );
}