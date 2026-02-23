import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotesStackParamList } from './types';
import NotesListScreen from '../screens/notes/NotesListScreen';
import NoteDetailScreen from '../screens/notes/NoteDetailScreen';

const Stack = createNativeStackNavigator<NotesStackParamList>();

export default function NotesStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NotesList" component={NotesListScreen} />
      <Stack.Screen
        name="NoteDetail"
        component={NoteDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
