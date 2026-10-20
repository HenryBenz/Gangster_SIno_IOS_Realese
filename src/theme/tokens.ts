import { useWindowDimensions } from 'react-native';

export const colors = {
  navy900: '#061638',
  navy800: '#071C49',
  indigo700: '#17105C',
  purpleGlow: '#6331C7',
  gold500: '#FFC928',
  gold700: '#D99512',
  coral500: '#FF3F48',
  green500: '#86B66D',
  cream100: '#F4E8D3',
  white: '#FFFFFF',
  blackOverlay: 'rgba(2, 8, 24, 0.72)',
  threatControlled: '#2F6BFF',
};

export const fonts = {
  display: 'Oswald_700Bold',
  displaySemi: 'Oswald_600SemiBold',
  body: 'Nunito_400Regular',
  bodySemi: 'Nunito_600SemiBold',
  bodyBold: 'Nunito_700Bold',
};

export function useScreenPadding(): number {
  const { width } = useWindowDimensions();
  return width >= 600 ? 32 : 20;
}
