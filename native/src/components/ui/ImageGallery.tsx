import React, { useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../theme/useTheme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_SIZE = (SCREEN_WIDTH - 48) / 3; // 3 columns with 8px gaps

interface ImageGalleryProps {
  images: string[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const { colors } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <>
      <View style={styles.grid}>
        {images.map((uri, index) => (
          <Pressable
            key={uri}
            onPress={() => setSelectedIndex(index)}
            style={styles.thumbWrapper}
          >
            <Image
              source={{ uri }}
              style={[styles.thumb, { borderColor: colors.separator }]}
              contentFit="cover"
              transition={150}
            />
          </Pressable>
        ))}
      </View>

      <Modal
        visible={selectedIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedIndex(null)}
      >
        <View style={styles.modalBg}>
          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={() => setSelectedIndex(null)}>
            <Text style={styles.closeTxt}>✕</Text>
          </Pressable>

          {/* Full-screen scroll */}
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (selectedIndex ?? 0) * SCREEN_WIDTH, y: 0 }}
            style={styles.fullScroll}
          >
            {images.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={styles.fullImage}
                contentFit="contain"
                transition={200}
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  thumbWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  fullScroll: {
    flex: 1,
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
