import React, { useContext, useState } from 'react';
import { View, Text, TextInput, Button, Alert, FlatList } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { AppContext } from '@/navigation/AppNavigator';
import CadencePicker, { Cadence } from '@/components/CadencePicker';

export default function AdminScreen() {
  const { projectId } = useContext(AppContext);
  const qc = useQueryClient();
  const [budget, setBudget] = useState('');
  const now = dayjs(); const month = now.month() + 1; const year = now.year();

  const { data: categories } = useQuery({
    enabled: !!projectId,
    queryKey: ['categories', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_categories', { p_project_id: projectId });
      if (error) throw error;
      return data as Array<{ id: string; name: string }>; 
    }
  });

  const addCategory = async (name: string) => {
    if (!projectId || !name) return;
    const { error } = await supabase.rpc('add_project_category', { p_project_id: projectId, p_name: name });
    if (error) Alert.alert('Error', error.message); else qc.invalidateQueries({ queryKey: ['categories', projectId] });
  };

  const [newCat, setNewCat] = useState('');

  const setMonthlyBudget = async () => {
    if (!projectId || !budget) return;
    const amt = parseFloat(budget);
    const { error } = await supabase.rpc('upsert_project_budget', { p_project_id: projectId, p_month: month, p_year: year, p_amount: amt });
    if (error) Alert.alert('Error', error.message); else {
      Alert.alert('Saved', 'Budget updated');
      qc.invalidateQueries();
    }
  };

  const { data: recurring } = useQuery({
    enabled: !!projectId,
    queryKey: ['recurring', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_recurring_expenses', { p_project_id: projectId });
      if (error) throw error;
      return data as Array<{
        id: string; category_name: string | null; amount: number; cadence: Cadence; interval_count: number;
        start_date: string; end_date: string | null; active: boolean; note: string | null; last_applied_on: string | null;
      }>; 
    }
  });

  const [reAmount, setReAmount] = useState('');
  const [reCategoryId, setReCategoryId] = useState<string | null>(null);
  const [reCadence, setReCadence] = useState<Cadence>('monthly');
  const [reInterval, setReInterval] = useState('1');
  const [reStart, setReStart] = useState(dayjs().format('YYYY-MM-DD'));
  const [reEnd, setReEnd] = useState('');
  const [reNote, setReNote] = useState('');

  const addRecurring = async () => {
    if (!projectId) return Alert.alert('Select project first');
    const amt = parseFloat(reAmount);
    if (!amt || !reCategoryId) return Alert.alert('Enter amount and choose category');
    const interval = Math.max(1, parseInt(reInterval || '1', 10));
    const { error } = await supabase.rpc('add_recurring_expense', {
      p_project_id: projectId,
      p_category_id: reCategoryId,
      p_amount: amt,
      p_cadence: reCadence,
      p_interval_count: interval,
      p_start_date: reStart,
      p_end_date: reEnd || null,
      p_note: reNote || null,
    });
    if (error) return Alert.alert('Error', error.message);
    setReAmount(''); setReNote('');
    qc.invalidateQueries({ queryKey: ['recurring', projectId] });
    Alert.alert('Saved', 'Recurring rule added');
  };

  const toggleRecurring = async (id: string, active: boolean) => {
    const { error } = await supabase.rpc('toggle_recurring_expense', { p_id: id, p_active: !active });
    if (error) return Alert.alert('Error', error.message);
    qc.invalidateQueries({ queryKey: ['recurring', projectId] });
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontWeight: '700' }}>Admin</Text>
      {!projectId ? <Text>Select a project first</Text> : (
        <>
          <Text style={{ marginTop: 8, fontWeight: '600' }}>Categories</Text>
          <FlatList
            data={categories || []}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => <Text style={{ paddingVertical: 4 }}>{item.name}</Text>}
            style={{ maxHeight: 200 }}
          />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput placeholder="New category" value={newCat} onChangeText={setNewCat} style={{ borderWidth: 1, borderRadius: 8, padding: 10, flex: 1 }} />
            <Button title="Add" onPress={() => { addCategory(newCat); setNewCat(''); }} />
          </View>

          <Text style={{ marginTop: 16, fontWeight: '600' }}>Monthly Budget ({month}/{year})</Text>
          <TextInput placeholder="Amount (INR)" keyboardType="decimal-pad" value={budget} onChangeText={setBudget} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
          <Button title="Save Budget" onPress={setMonthlyBudget} />

          <View style={{ height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 }} />

          <Text style={{ marginTop: 4, fontWeight: '700' }}>Recurring expenses</Text>
          <FlatList
            data={recurring || []}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#e5e7eb' }}>
                <Text>{item.category_name || 'Uncategorized'} • {item.cadence} x{item.interval_count} • {item.amount}</Text>
                <Text style={{ color: '#6b7280' }}>
                  {item.start_date}{item.end_date ? ` → ${item.end_date}` : ''} • {item.active ? 'Active' : 'Paused'}{item.last_applied_on ? ` • last: ${item.last_applied_on}` : ''}
                </Text>
                <View style={{ marginTop: 4 }}>
                  <Button title={item.active ? 'Pause' : 'Resume'} onPress={() => toggleRecurring(item.id, item.active)} />
                </View>
              </View>
            )}
            style={{ maxHeight: 240 }}
          />

          <Text style={{ marginTop: 12, fontWeight: '600' }}>Add recurring</Text>
          <TextInput placeholder="Amount (INR)" keyboardType="decimal-pad" value={reAmount} onChangeText={setReAmount} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
          <Text style={{ fontWeight: '600' }}>Category</Text>
          <View style={{ gap: 6 }}>
            {categories?.map((c) => (
              <Text key={c.id} onPress={() => setReCategoryId(c.id)} style={{ padding: 8, borderWidth: 1, borderRadius: 8, backgroundColor: reCategoryId === c.id ? '#e5e7eb' : 'transparent' }}>
                {c.name}
              </Text>
            ))}
          </View>
          <Text style={{ fontWeight: '600' }}>Cadence</Text>
          <CadencePicker value={reCadence} onChange={setReCadence} />
          <TextInput placeholder="Interval (e.g., 1 = every month)" keyboardType="number-pad" value={reInterval} onChangeText={setReInterval} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
          <TextInput placeholder="Start date (YYYY-MM-DD)" value={reStart} onChangeText={setReStart} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
          <TextInput placeholder="End date (optional, YYYY-MM-DD)" value={reEnd} onChangeText={setReEnd} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
          <TextInput placeholder="Note (optional)" value={reNote} onChangeText={setReNote} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }} />
          <Button title="Add Recurring" onPress={addRecurring} />
        </>
      )}
    </View>
  );
}