import { Linking } from 'react-native';
import { NavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';

let navigationRef: NavigationContainerRef<RootStackParamList> | null = null;

export function setNavigationRef(ref: NavigationContainerRef<RootStackParamList>) {
  navigationRef = ref;
}

/**
 * Parse a FixNote deep link URL.
 * Supported patterns:
 *   fixnote://share/<token>
 *   https://fixnote.app/share/<token>
 */
export function parseDeepLink(url: string): { screen: 'SharedNote'; token: string } | null {
  try {
    // Custom scheme
    const customMatch = url.match(/^fixnote:\/\/share\/([A-Za-z0-9_-]+)/);
    if (customMatch) {
      return { screen: 'SharedNote', token: customMatch[1] };
    }

    // HTTPS universal link
    const httpsMatch = url.match(/^https?:\/\/[^/]+\/share\/([A-Za-z0-9_-]+)/);
    if (httpsMatch) {
      return { screen: 'SharedNote', token: httpsMatch[1] };
    }
  } catch {
    // ignore malformed URLs
  }
  return null;
}

/**
 * Handle an incoming deep link URL and navigate accordingly.
 */
export function handleDeepLink(url: string): void {
  const parsed = parseDeepLink(url);
  if (!parsed || !navigationRef?.isReady()) return;

  if (parsed.screen === 'SharedNote') {
    navigationRef.navigate('SharedNote', { token: parsed.token });
  }
}

/**
 * Set up deep link listener. Call once from the app root.
 * Returns a cleanup function.
 */
export function setupDeepLinkHandler(): () => void {
  // Handle links that open the app from a closed state
  Linking.getInitialURL().then((url) => {
    if (url) handleDeepLink(url);
  });

  // Handle links while the app is open / in background
  const subscription = Linking.addEventListener('url', ({ url }) => {
    handleDeepLink(url);
  });

  return () => subscription.remove();
}
