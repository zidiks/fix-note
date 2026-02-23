import { NavigatorScreenParams } from '@react-navigation/native';

// Notes tab stack
export type NotesStackParamList = {
  NotesList: undefined;
  NoteDetail: { noteId: string };
};

// Profile tab stack
export type ProfileStackParamList = {
  Profile: undefined;
  Language: undefined;
  Subscription: undefined;
  SyncSettings: undefined;
};

// Main bottom tabs
export type MainTabParamList = {
  NotesTab: NavigatorScreenParams<NotesStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

// Root stack (Auth | Main | Modals)
export type RootStackParamList = {
  Welcome: undefined;
  TelegramAuth: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  SharedNote: { token: string };
};
