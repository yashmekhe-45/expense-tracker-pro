import React, { useContext, useEffect, useMemo } from 'react';
import { View, Text, Button, FlatList } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';
import { AppContext } from '@/navigation/AppNavigator';
import BudgetProgress from '@/components/BudgetProgress';
import CategoryPieChart from '@/components/CategoryPieChart';
import MonthlyTrendChart from '@/components/MonthlyTrendChart';
import { formatCurrency } from '@/utils/format';

export default function DashboardScreen({ navigation }: any) {
  const { projectId } = useContext(AppContext);
  const qc = useQueryClient();
  const today = useMemo(() => dayjs(), []);
  const ym = { month: today.month() + 1, year: today.year() };

  useEffect(() => {
    const run = async () => {
      if (!projectId) return;
      try {
        await supabase.rpc('apply_recurring_expenses', { p_project_id: projectId });
        qc.invalidateQueries({ queryKey: ['budget-status', projectId] });
        qc.invalidateQueries({ queryKey: ['summary', projectId] });
        qc.invalidateQueries({ queryKey: ['recent-expenses', projectId] });
        qc.invalidateQueries({ queryKey: ['trend', projectId] });
      } catch { /* ignore */ }
    };
    run();
  }, [projectId, qc]);

  const { data: summary } = useQuery({
    enabled: !!projectId,
    queryKey: ['summary', projectId, ym],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_monthly_summary', { p_project_id: projectId, p_month: ym.month, p_year: ym.year });
      if (error) throw error;
      return data as Array<{ category: string; total: number }>; 
    }
  });

  const { data: budget } = useQuery({
    enabled: !!projectId,
    queryKey: ['budget-status', projectId, ym],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_budget_status', { p_project_id: projectId, p_month: ym.month, p_year: ym.year });
      if (error) throw error;
      return data as { budget: number; spent: number; remaining: number; pct: number }; 
    }
  });

  const { data: recent } = useQuery({
    enabled: !!projectId,
    queryKey: ['recent-expenses', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses_view')
        .select('*')
        .eq('project_id', projectId)
        .order('spent_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Array<any>;
    }
  });

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      {!projectId ? (
        <View>
          <Text style={{ fontSize: 18, fontWeight: '600' }}>No project selected</Text>
          <Button title="Choose a project" onPress={() => navigation.navigate('Projects')} />
        </View>
      ) : (
        <>
          <BudgetProgress budget={budget?.budget || 0} spent={budget?.spent || 0} />
          <CategoryPieChart data={summary || []} />
          <MonthlyTrendChart projectId={projectId} />
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontWeight: '600', marginBottom: 8 }}>Recent expenses</Text>
            <FlatList
              data={recent || []}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <View style={{ paddingVertical: 6 }}>
                  <Text>{dayjs(item.spent_at).format('MMM D')} • {item.category_name} • {formatCurrency(item.amount)}</Text>
                  {item.note ? <Text style={{ color: '#6b7280' }}>{item.note}</Text> : null}
                </View>
              )}
            />
          </View>
          <Button title="Add expense" onPress={() => navigation.navigate('Add Expense' as never)} />
        </>
      )}
    </View>
  );
}