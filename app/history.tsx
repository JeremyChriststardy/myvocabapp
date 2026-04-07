"use client"

import React, { useEffect, useState, useCallback } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  Image, 
  ActivityIndicator,
  RefreshControl 
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/supabase";

// Updated to match Web interface
type HistoryItem = {
  id: string;
  word: string;
  phonetic: string;
  definition: string;
  image: string;
  part_of_speech: string;
  created_at: string;
};

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Fetch the data from the table
    const { data, error } = await supabase
      .from("user_vocabs")
      .select(`
        id,
        created_at,
        phonetic,
        image_path,
        dictionary_entries (
          word,
          definition,
          part_of_speech
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // 2. Transform data and generate Signed URLs for private images
    const formattedData = await Promise.all((data || []).map(async (item: any) => {
      let finalImageUrl = "https://via.placeholder.com/150";

      if (item.image_path) {
        // Generate a 1-hour signed URL (3600 seconds)
        const { data: signedData } = await supabase.storage
          .from("captures")
          .createSignedUrl(item.image_path, 10800);
        
        if (signedData?.signedUrl) {
          finalImageUrl = signedData.signedUrl;
        }
      }

      return {
        id: item.id,
        created_at: item.created_at,
        word: item.dictionary_entries?.word || "Unknown",
        phonetic: item.phonetic || item.dictionary_entries?.phonetic || "",
        definition: item.dictionary_entries?.definition || "No definition",
        image: finalImageUrl, // This is now a working, temporary URL
        part_of_speech: item.dictionary_entries?.part_of_speech || "Noun",
      };
    }));

    setHistory(formattedData);
  } catch (error) {
    console.error("Error fetching history:", error);
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        {/* Word Image */}
        <Image 
          source={{ uri: item.image }} 
          style={styles.thumbnail} 
          resizeMode="cover"
        />
        
        <View style={styles.mainInfo}>
          <View style={styles.headerRow}>
            <Text style={styles.word}>{item.word}</Text>
            <Text style={styles.timestamp}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.phonetic}>{item.phonetic}</Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <Text style={styles.sectionLabel}>Definition</Text>
        <Text style={styles.definition}>{item.definition}</Text>
      </View>

      <View style={styles.contentSection}>
        <Text style={styles.sectionLabel}>Part of Speech</Text>
        <Text style={styles.story}>{item.part_of_speech}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>History</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#4DA6FF" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No history found. Enjoy the journey!</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 80,
    paddingHorizontal: 20,
  },
  backButton: {
    marginBottom: 20,
  },
  backText: {
    color: "white",
    fontSize: 16,
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#222",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#222",
    marginRight: 12,
  },
  mainInfo: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  word: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  phonetic: {
    color: "#666",
    fontSize: 14,
    marginTop: 2,
  },
  timestamp: {
    color: "#444",
    fontSize: 11,
  },
  context: {
    color: "#4DA6FF",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
    backgroundColor: "rgba(77, 166, 255, 0.1)",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  contentSection: {
    marginTop: 10,
  },
  sectionLabel: {
    color: "#555",
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  definition: {
    color: "#ccc",
    fontSize: 14,
    lineHeight: 20,
  },
  story: {
    color: "#aaa",
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
    marginTop: 40,
    fontSize: 16,
  },
});