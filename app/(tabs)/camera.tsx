import { decode } from 'base64-arraybuffer';
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { ScanningFrame } from "../../components/ui/ScanningFrame";
import { supabase } from "../../supabase";

type Mode = "real_world" | "gaming";
type CameraState = "preview" | "processing" | "result";


export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const { height } = Dimensions.get("window");

  const [mode, setMode] = useState<Mode>("real_world");
  const [cameraState, setCameraState] = useState<CameraState>("preview");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [result, setResult] = useState<{ word: string; definition: string, id: string, phonetic: string, part_of_speech: string} | null>(null);
  const [showSaveLoginModal, setShowSaveLoginModal] = useState(false);
  const [showHistoryLoginModal, setShowHistoryLoginModal] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const sendImage = async (base64Image?: string) => {
    try {
      const payload = JSON.stringify({ image: base64Image || "mock_base64_string" });
      
      // 1. Log the size to see if you're over 4.5MB
      const sizeInMB = (payload.length / (1024 * 1024)).toFixed(2);
      console.log(`🚀 Sending to backend (${sizeInMB} MB)`);

      const res = await fetch("https://myvocabweb.vercel.app/api/scan-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });

      console.log("📡 HTTP Status:", res.status);

      // 2. Read as text first to avoid JSON parse errors
      const textResponse = await res.text();
      
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        console.error("❌ Server returned non-JSON response. Check Vercel limits.");
        console.log("Server Message:", textResponse.substring(0, 200)); // Show the first 200 chars
        return null;
      }

      console.log("API RESPONSE:", data);

      if (res.ok && data.result) {
        return {
          word: data.result.word,
          definition: data.result.definition,
          id: data.result.id,
          phonetic: data.result.phonetic,
          part_of_speech: data.result.part_of_speech,
        };
      }
      return null;
    } catch (err) {
      console.error("🚨 NETWORK/FETCH ERROR:", err);
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

    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: false });
      if (!photo?.uri) return;

      setCapturedImage(photo.uri);
      setCameraState("processing");
      openSheet();

      const manipulatedImage = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      const base64String = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
        encoding: 'base64',
      });

      setCompressedBase64(base64String);

      // fetch result via sendImage using precompressed Base64
      const resultData = await sendImage(base64String);

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
    } catch (err) {
      console.error("Camera capture failed", err);
      setCameraState("preview");
    }
  };

  const handleRetake = () => {
    hideSheetCompletely();
    setCapturedImage(null);
    setCompressedBase64(null);
    setResult(null);
    setCameraState("preview");
  };

  const handleStartScanning = async () => {
    if (permission?.granted) {
      setPermissionDenied(false);
      setIsCameraActive(true);
      return;
    }

    const permissionResult = await requestPermission();
    if (permissionResult?.granted) {
      setPermissionDenied(false);
      setIsCameraActive(true);
      return;
    }

    setPermissionDenied(true);
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

  const isPermissionGranted = permission?.granted === true;
  const isPermissionDenied = permission?.status === 'denied';

  try {
    return (
      <View style={styles.container}>
        {!isCameraActive && (
          <View style={styles.starterContainer}>
            <Text style={styles.starterTitle}>Ready to Scan</Text>
            <Text style={styles.starterSubtitle}>
              Tap the button below to request camera access and start scanning.
            </Text>
            {(permissionDenied || isPermissionDenied) && (
              <Text style={styles.deniedText}>
                Camera access was denied. Please enable it in settings and try again.
              </Text>
            )}
            <TouchableOpacity style={styles.primaryButton} onPress={handleStartScanning}>
              <Text style={styles.primaryButtonText}>Start Scanning</Text>
            </TouchableOpacity>
          </View>
        )}

        {isCameraActive && isPermissionGranted && (
          <>
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
                    height: height * 0.2, // top 10%
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
                    height: height * 0.2, // bottom 20%
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

                              if (!compressedBase64) {
                                console.error("Compressed Base64 is missing. Capture must complete before saving.");
                                return;
                              }

                              const fileExt = "jpg";
                              const filePath = `${user.id}/${Date.now()}.${fileExt}`;
                              console.log("1. Upload initiated using precompressed Base64...");

                              const base64 = compressedBase64;

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
  } catch (err) {
    console.error("Camera screen failed to render", err);
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Camera Error - App Still Alive</Text>
      </View>
    );
  }
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

  loadingContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#111',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#990000',
    textAlign: 'center',
  },
  starterContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  starterTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D3B66',
    marginBottom: 12,
    textAlign: 'center',
  },
  starterSubtitle: {
    fontSize: 16,
    color: '#333333',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  deniedText: {
    color: '#B00020',
    textAlign: 'center',
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: '#0D3B66',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
    maxWidth: 280,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
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
