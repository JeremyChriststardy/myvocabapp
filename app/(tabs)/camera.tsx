import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { ScanningFrame } from "../../components/ui/ScanningFrame";
import { supabase } from "@/supabase";

type Mode = "real_world" | "gaming";
type CameraState = "preview" | "processing" | "result";


export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const { height } = Dimensions.get("window");

  const [mode, setMode] = useState<Mode>("real_world");
  const [cameraState, setCameraState] = useState<CameraState>("preview");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [result, setResult] = useState<{ word: string; definition: string, id: string, phonetic: string, part_of_speech: string} | null>(null);
  const [showSaveLoginModal, setShowSaveLoginModal] = useState(false);
  const [showHistoryLoginModal, setShowHistoryLoginModal] = useState(false);

  const sendImage = async (base64Image?: string) => {
    try {
      const payload = JSON.stringify({ image: base64Image || "mock_base64_string" });
      console.log("Sending to backend:", payload);

      const res = await fetch(
        "https://superexcrescently-unsympathizing-jolyn.ngrok-free.dev/api/scan-word",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        }
      );

      const data = await res.json();
      console.log("API RESPONSE:", data);

      if (data.ok && data.result) {
        return {
          word: data.result.word,
          definition: data.result.definition,
          id: data.result.id, // This is the UUID from your dictionary table
          phonetic: data.result.phonetic,
          part_of_speech: data.result.part_of_speech,
        };
      }
      return null;
    } catch (err) {
      console.error("ERROR:", err);
      return null;
    }
  };

  const sheetHeight = 400;
  const collapsedPosition = sheetHeight - 60;

  const slideAnim = useRef(new Animated.Value(sheetHeight)).current;
  const currentOffset = useRef(sheetHeight);

  const mockResult = [
    {
      word: "storm",
      definition: "blow hard",
    },
  ];

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  const openSheet = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start(() => (currentOffset.current = 0));
  };

  const collapseSheet = () => {
    Animated.timing(slideAnim, {
      toValue: collapsedPosition,
      duration: 250,
      useNativeDriver: false,
    }).start(() => (currentOffset.current = collapsedPosition));
  };

  const hideSheetCompletely = () => {
    Animated.timing(slideAnim, {
      toValue: sheetHeight,
      duration: 200,
      useNativeDriver: false,
    }).start(() => (currentOffset.current = sheetHeight));
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    const photo = await cameraRef.current.takePictureAsync({ base64: true });
    if (!photo?.base64) return;

    setCapturedImage(photo.uri);
    setCameraState("processing");
    openSheet();

    // fetch result via sendImage
    const resultData = await sendImage(photo.base64);

    // set single object or fallback
    setResult(
      resultData
        ? {
            word: resultData.word,
            definition: resultData.definition,
            id: resultData.id || "temp-id",
            phonetic: resultData.phonetic || "",
            part_of_speech: resultData.part_of_speech || "Noun",
          }
        : {
            word: "example",
            definition: "mock definition",
            id: "mock-id",
            phonetic: "",
            part_of_speech: "Noun",
          }
    );
    setCameraState("result");
  };

  const handleRetake = () => {
    hideSheetCompletely();
    setCapturedImage(null);
    setResult(null);
    setCameraState("preview");
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        let newValue = currentOffset.current + gestureState.dy;
        if (newValue < 0) newValue = 0;
        if (newValue > collapsedPosition) newValue = collapsedPosition;
        slideAnim.setValue(newValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) collapseSheet();
        else openSheet();
      },
    })
  ).current;

  if (!permission) return <View />;
  if (!permission.granted)
    return (
      <View style={styles.center}>
        <Text style={{ color: "white" }}>No access to camera</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      {/* CAMERA PREVIEW */}
      {cameraState === "preview" && (
        <>
          <CameraView ref={cameraRef} style={styles.camera} />

          {/* Overlay scanning frame */}
          <ScanningFrame mode={mode === "real_world" ? "real" : "game"} />

          {/* Top gradient covering 10% */}
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "transparent"]}
            style={{ 
              position: "absolute", 
              top: 0, 
              left: 0, 
              right: 0, 
              height: height * 0.2  // top 10%
            }}
          />

          {/* Bottom gradient covering 20% */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.6)"]}
            style={{ 
              position: "absolute", 
              bottom: 0, 
              left: 0, 
              right: 0, 
              height: height * 0.2  // bottom 20%
            }}
          />

          {/* Settings */}
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push("../profile")}
          >
            <Icon name="account-circle" size={24} color="white" />
          </TouchableOpacity>

          <View style={styles.bottomControls}>
            {/* History */}
            <TouchableOpacity
              style={styles.sideButton}
              onPress={async () => {
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    router.push("/history");
                  } else {
                    setShowHistoryLoginModal(true);
                  }
                } catch (err) {
                  setShowHistoryLoginModal(true);
                }
              }}
            >
              <Icon name="book" size={30} color="white" />
            </TouchableOpacity>

            {/* Capture */}
            <TouchableOpacity
              style={[styles.captureButton, { opacity: 0.4 }]}
              onPress={handleCapture}
            >
              <View style={styles.captureInner} />
            </TouchableOpacity>

            {/* Mode toggle */}
            <TouchableOpacity
              style={styles.sideButton}
              onPress={() =>
                setMode(mode === "real_world" ? "gaming" : "real_world")
              }
            >
              <Icon
                name={mode === "real_world" ? "public" : "sports-esports"}
                size={30}
                color="white"
              />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* FROZEN IMAGE */}
      {cameraState !== "preview" && capturedImage && (
        <>
          <Image source={{ uri: capturedImage }} style={styles.camera} />

          {/* Back */}
          <TouchableOpacity style={styles.backButton} onPress={handleRetake}>
            <Icon name="arrow-back" size={24} color="white" />
          </TouchableOpacity>

          <Animated.View
            style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
            {...panResponder.panHandlers}
          >
            <View style={styles.dragHandle} />

            {cameraState === "processing" && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={styles.loadingText}>Analyzing...</Text>
              </View>
            )}

            {cameraState === "result" && result && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.word}>{result.word}</Text>
                  <Text style={styles.pos}> ({result.part_of_speech.toLowerCase()})</Text>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={async () => {
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) {
                          setShowSaveLoginModal(true);
                          return;
                        }

                        // --- 1. COMPRESSION ---
                        console.log("1. Starting compression...");
                        const manipulatedImage = await ImageManipulator.manipulateAsync(
                          capturedImage!,
                          [{ resize: { width: 800 } }],
                          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                        );

                        // --- 2. THE BYPASS (No more uriToBlob) ---
                        console.log("2. Reading file as Base64...");
                        // We read directly from the URI provided by ImageManipulator
                        const base64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
                          encoding: 'base64', // Use the string directly to avoid the TS error
                        });

                        const fileExt = "jpg";
                        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
                        console.log("3. Storage upload initiated (ArrayBuffer mode)...");

                        // --- 3. UPLOAD USING DECODED ARRAYBUFFER ---
                        // decode(base64) turns the string into binary data Supabase loves
                        const { data: uploadData, error: uploadError } = await supabase.storage
                          .from("captures")
                          .upload(filePath, decode(base64), {
                            contentType: "image/jpeg",
                            upsert: true 
                          });

                        if (uploadError) {
                          console.error("Storage upload failed:", uploadError);
                          return;
                        }

                        // --- 4. DATABASE SAVE ---
                        console.log("4. Database upsert initiated...");
                        const { error: dbError } = await supabase.from("user_vocabs").upsert({
                          user_id: user.id,
                          dictionary_entry_id: result.id,
                          phonetic: result.phonetic || "",
                          status: "New",
                          image_path: filePath, 
                        });

                        if (dbError) {
                          console.error("Database save failed:", dbError);
                        } else {
                          console.log("Success! Small image saved via ArrayBuffer.");
                          router.push("/history"); 
                        }
                      } catch (err) {
                        console.error("The Ultimate Bypass Failed:", err);
                      }
                    }}
                  >
                    <Icon name="save" size={20} color="white" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.definition}>{result.definition}</Text>
              </View>
            )}
          </Animated.View>
        </>
      )}

      {/* Save Login Modal */}
      <Modal
        visible={showSaveLoginModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowSaveLoginModal(false)}
            >
              <Icon name="close" size={24} color="#999" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Log in to save a word.</Text>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => {
                setShowSaveLoginModal(false);
                router.push("../login");
              }}
            >
              <Text style={styles.loginButtonText}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* History Login Modal */}
      <Modal
        visible={showHistoryLoginModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowHistoryLoginModal(false)}
            >
              <Icon name="close" size={24} color="#999" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Log in to see your word collection.</Text>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => {
                setShowHistoryLoginModal(false);
                router.push("../login");
              }}
            >
              <Text style={styles.loginButtonText}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },

  bottomControls: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
  },

  sideButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  settingsButton: {
    position: "absolute",
    top: 60,
    right: 20,
    padding: 10,
    borderRadius: 20,
  },

  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },

  captureInner: {
    width: 65,
    height: 65,
    borderRadius: 35,
    backgroundColor: "white",
  },

  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    padding: 8,
    borderRadius: 20,
  },

  bottomSheet: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 400,
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },

  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: "#555",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 10,
  },

  loadingText: {
    marginTop: 12,
    color: "#aaa",
  },

  card: {
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  word: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },

  definition: {
    color: "#ccc",
    fontSize: 15,
  },

  pos: {
    fontSize: 18,
    fontStyle: 'italic',
    color: '#666',
  },

  saveButton: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  topShadowGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },

  bottomShadowGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },

  modalContent: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 24,
    width: "80%",
    alignItems: "center",
  },

  closeButton: {
    position: "absolute",
    top: 12,
    left: 12,
    padding: 8,
  },

  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 24,
    textAlign: "center",
  },

  loginButton: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },

  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
