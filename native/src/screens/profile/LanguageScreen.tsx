import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme/useTheme';
import { useI18n, Language } from '../../i18n';
import { notesApi } from '../../api/notes';

type Props = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, 'Language'>;
};

const LANGUAGES: { code: Language; label: string; nativeLabel: string }[] = [
  { code: 'ru', label: 'Русский', nativeLabel: 'Русский' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
];

export default function LanguageScreen({ navigation }: Props) {
  const { colors, typography } = useTheme();
  const { language, setLanguage, t } = useI18n();

  const handleSelect = async (lang: Language) => {
    setLanguage(lang);
    try {
      await notesApi.updateLanguage(lang);
    } catch {
      // Non-critical
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backText, { color: colors.accent }]}>← {t('back')}</Text>
        </TouchableOpacity>
        <Text style={[typography.headline, { color: colors.textPrimary }]}>{t('language')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={[styles.section, { backgroundColor: colors.bgSecondary, borderColor: colors.separator }]}>
        {LANGUAGES.map((lang, i) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.item,
              { borderBottomColor: colors.separator },
              i === LANGUAGES.length - 1 && { borderBottomWidth: 0 },
            ]}
            onPress={() => handleSelect(lang.code)}
            activeOpacity={0.7}
          >
            <Text style={[typography.body, { color: colors.textPrimary }]}>
              {lang.nativeLabel}
            </Text>
            {language === lang.code && (
              <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backText: { fontSize: 17 },
  section: {
    margin: 16,
    borderRadius: 12,
    borderWidth: 0.5,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
});
