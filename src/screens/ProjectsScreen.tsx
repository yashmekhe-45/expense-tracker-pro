import React, { useContext } from 'react';
import { View, Text, FlatList, Button, TextInput, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AppContext } from '@/navigation/AppNavigator';

export default function ProjectsScreen({ navigation }: any) {
  const { setProjectId, projectId } = useContext(AppContext);
  const { data, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_projects');
      if (error) throw error;
      return data as Array<{ id: string; name: string }>; 
    }
  });

  const [newName, setNewName] = React.useState('');

  const createProject = async () => {
    if (!newName) return;
    const { error } = await supabase.rpc('create_project_with_membership', { p_name: newName });
    if (error) Alert.alert('Error', error.message);
    else {
      setNewName('');
      refetch();
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>Your Projects</Text>
      <FlatList
        data={data || []}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 }}>
            <Text style={{ fontWeight: '500' }}>{item.name}</Text>
            <Button title={projectId === item.id ? 'Selected' : 'Use this project'} onPress={() => { setProjectId(item.id); navigation.goBack(); }} />
          </View>
        )}
      />
      <View style={{ borderTopWidth: 1, paddingTop: 12 }}>
        <Text style={{ fontWeight: '600' }}>Create new project</Text>
        <TextInput placeholder="Project name" value={newName} onChangeText={setNewName} style={{ borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 8 }} />
        <Button title="Create" onPress={createProject} />
      </View>
    </View>
  );
}