import { useRouter } from 'expo-router';
import React from 'react';
import { Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function Home() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>System Check: App Loaded</Text>
        <Text style={styles.subtitle}>
          The app has mounted successfully. Press the button below to continue to the camera screen.
        </Text>
        <View style={styles.buttonContainer}>
          <Button title="Go to Camera" onPress={() => router.push('/camera')} />
        </View>
      </View>
    </SafeAreaView>
  );
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