import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/camera');
  }, [router]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDF7FF',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'stretch',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0D3B66',
    marginBottom: 18,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333333',
    marginBottom: 28,
  },
  buttonContainer: {
    alignSelf: 'stretch',
  },
});