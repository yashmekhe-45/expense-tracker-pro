import React, { useEffect, useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LoginScreen from '@/screens/LoginScreen';
import DashboardScreen from '@/screens/DashboardScreen';
import AddExpenseScreen from '@/screens/AddExpenseScreen';
import ProjectsScreen from '@/screens/ProjectsScreen';
import AdminScreen from '@/screens/AdminScreen';
import { supabase } from '@/lib/supabase';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator } from 'react-native';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Projects: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

export type AppContextType = {
  projectId: string | null;
  setProjectId: (v: string | null) => void;
};
export const AppContext = React.createContext<AppContextType>({ projectId: null, setProjectId: () => {} });

const Tabs = () => (
  <Tab.Navigator>
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Add Expense" component={AddExpenseScreen} />
    <Tab.Screen name="Admin" component={AdminScreen} />
  </Tab.Navigator>
);

export default function AppNavigator() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!sessionChecked) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={{ projectId, setProjectId }}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: true }}>
            {!session ? (
              <Stack.Screen name="Auth" component={LoginScreen} options={{ headerShown: false }} />
            ) : (
              <>
                <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
                <Stack.Screen name="Projects" component={ProjectsScreen} options={{ title: 'Select Project' }} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AppContext.Provider>
    </QueryClientProvider>
  );
}