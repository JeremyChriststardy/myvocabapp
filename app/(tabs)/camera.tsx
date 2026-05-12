import { decode } from 'base64-arraybuffer';
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
type CameraState = "preview" | "cropping" | "processing" | "result";
type CropHandle =
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "top"
  | "bottom"
  | "left"
  | "right";

type PhotoInfo = {
  uri: string;
  width: number;
  height: number;
};

export default function CameraScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const { height } = Dimensions.get("window");

  const [mode, setMode] = useState<Mode>("real_world");
  const [cameraState, setCameraState] = useState<CameraState>("preview");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<PhotoInfo | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [imageLayout, setImageLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [result, setResult] = useState<{ word: string; definition: string, id: string, phonetic: string, part_of_speech: string} | null>(null);
  const [showSaveLoginModal, setShowSaveLoginModal] = useState(false);
  const [showHistoryLoginModal, setShowHistoryLoginModal] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const sendImage = async (imageUri: string, extraFields?: { mode?: string }) => {
    console.log("🚀 STARTING GUEST RELAY...");

    // 1. Setup Timeout (60 seconds for AI processing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("⏱️ TIMEOUT: Aborting request...");
      controller.abort();
    }, 60000); 

    try {
      // --- 1. UPLOAD TO ANONYMOUS BUCKET ---
      const fileName = `guest_${Date.now()}.jpg`;
      console.log("⬆️ 1. Reading file for Supabase...");

      const base64String = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });

      console.log("⬆️ 2. Uploading to Supabase...");
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("guest_scans")
        .upload(fileName, decode(base64String), {
          contentType: "image/jpeg"
        });

      if (uploadError) {
        console.error("🚨 Supabase Guest Upload Failed:", uploadError.message);
        return null;
      }

      // --- 2. GET PUBLIC URL ---
      const { data } = supabase.storage
        .from("guest_scans")
        .getPublicUrl(fileName);
      
      const publicUrl = data?.publicUrl;

      if (!publicUrl) {
        console.error("🚨 Could not generate Public URL");
        return null;
      }

      console.log("✅ 3. Public URL acquired:", publicUrl);

      // --- 3. PING SUPABASE PROXY (THE UNBLOCKABLE ROUTE) ---
      console.log("➡️ 4. Pinging Supabase Edge Function...");

      const { data: relayData, error: relayError } = await supabase.functions.invoke('process-scan', {
        body: { 
          imageUrl: publicUrl, 
          mode: extraFields?.mode || "real_world" 
        }
      });

      if (relayError) {
        console.error("🚨 Supabase Relay Error:", relayError);
        return null;
      }

      console.log("🏁 5. Relay Complete! Data:", relayData);
      return relayData.result || null;

    } catch (error: any) {
      // Check if it was an intentional abort or a real crash
      if (error.name === 'AbortError') {
        console.error("🚨 RELAY TIMEOUT: Vercel took too long.");
      } else {
        console.error("🚨 RELAY EXECUTION CRASH:", error.message);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
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
    console.log("🚨 1. CAPTURE BUTTON PRESSED");

    if (!cameraRef.current) {
      console.log("❌ FATAL: cameraRef is null!");
      return;
    }

    try {
      console.log("📸 2. Calling takePictureAsync...");
      const photo = await cameraRef.current.takePictureAsync({ base64: false });
      
      if (!photo?.uri) {
        console.log("❌ FATAL: takePictureAsync returned no URI.");
        return;
      }

      console.log("✅ 3. Picture taken successfully!");

      const photoInfo: PhotoInfo = {
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      };

      setCapturedImage(photo.uri);
      setCapturedPhoto(photoInfo);
      hideSheetCompletely();

      if (mode === "gaming") {
        setCameraState("cropping");
        return;
      }

      setCameraState("processing");
      openSheet();

      console.log("🖼️ 4. Manipulating image (Resizing)...");
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // NOTICE: We completely deleted Step 5 (Reading as Base64). 
      // We are passing the native file URI directly to the uploader!
      
      console.log("🚀 5. Firing sendImage with URI:", manipulatedImage.uri);
      
      const resultData = await sendImage(manipulatedImage.uri, { mode });

      console.log("🏁 6. handleCapture completed.");
      
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
      console.error("❌ CAPTURE CRASHED:", err);
      setCameraState("preview");
    }
  };

  const cropRectRef = useRef(cropRect);
  const cropStartRect = useRef(cropRect);
  const activeCropHandle = useRef<CropHandle | null>(null);

  // ADD THESE:
  const imageLayoutRef = useRef(imageLayout);
  const capturedPhotoRef = useRef(capturedPhoto);

  useEffect(() => {
    cropRectRef.current = cropRect;
  }, [cropRect]);

  useEffect(() => {
    imageLayoutRef.current = imageLayout;
  }, [imageLayout]);

  useEffect(() => {
    capturedPhotoRef.current = capturedPhoto;
  }, [capturedPhoto]);


  const getDisplayedImageFrame = () => {
    // Read from refs instead of state
    const layout = imageLayoutRef.current;
    const photo = capturedPhotoRef.current;

    if (!photo || layout.width === 0 || layout.height === 0) {
      return {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      };
    }

    const imageAspect = photo.width / photo.height;
    let width = layout.width;
    let height = width / imageAspect;

    if (height > layout.height) {
      height = layout.height;
      width = height * imageAspect;
    }

    const x = layout.x + (layout.width - width) / 2;
    const y = layout.y + (layout.height - height) / 2;

    return { x, y, width, height };
  };

  const clampCropRect = (rect: { x: number; y: number; width: number; height: number }) => {
    const frame = getDisplayedImageFrame();
    const minSize = 60;

    if (!frame || frame.width === 0 || frame.height === 0) {
      return cropStartRect.current;
    }

    let { x, y, width, height } = rect;

    width = Math.max(minSize, Math.min(width, frame.width));
    height = Math.max(minSize, Math.min(height, frame.height));
    x = Math.max(frame.x, Math.min(x, frame.x + frame.width - width));
    y = Math.max(frame.y, Math.min(y, frame.y + frame.height - height));

    if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) {
      return cropStartRect.current;
    }

    return { x, y, width, height };
  };

  const updateCropByHandle = (handle: CropHandle, dx: number, dy: number) => {
    const start = cropStartRect.current;
    const frame = getDisplayedImageFrame();
    const minSize = 50;
    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;

    switch (handle) {
      case "topLeft": {
        const maxDx = start.width - minSize;
        const limitedDx = Math.min(dx, maxDx);
        const maxDy = start.height - minSize;
        const limitedDy = Math.min(dy, maxDy);
        x = start.x + limitedDx;
        y = start.y + limitedDy;
        width = Math.max(minSize, start.width - limitedDx);
        height = Math.max(minSize, start.height - limitedDy);
        break;
      }
      case "topRight":
        y = start.y + dy;
        width = Math.max(minSize, start.width + dx);
        height = Math.max(minSize, start.height - dy);
        break;
      case "bottomLeft": {
        const maxDx = start.width - minSize;
        const limitedDx = Math.min(dx, maxDx);
        x = start.x + limitedDx;
        width = Math.max(minSize, start.width - limitedDx);
        height = Math.max(minSize, start.height + dy);
        break;
      }
      case "bottomRight":
        width = Math.max(minSize, start.width + dx);
        height = Math.max(minSize, start.height + dy);
        break;
      case "top":
        y = start.y + dy;
        height = Math.max(minSize, start.height - dy);
        break;
      case "bottom":
        height = Math.max(minSize, start.height + dy);
        break;
      case "left": {
        const maxDx = start.width - minSize;
        const limitedDx = Math.min(dx, maxDx);
        x = start.x + limitedDx;
        width = Math.max(minSize, start.width - limitedDx);
        break;
      }
      case "right":
        width = Math.max(minSize, start.width + dx);
        break;
    }

    const nextRect = clampCropRect({ x, y, width, height });
    if (
      isFinite(nextRect.x) &&
      isFinite(nextRect.y) &&
      isFinite(nextRect.width) &&
      isFinite(nextRect.height)
    ) {
      setCropRect(nextRect);
    }
  };

  const cropPanResponders = useRef<Record<CropHandle, any>>({} as Record<CropHandle, any>);

  if (Object.keys(cropPanResponders.current).length === 0) {
    [
      "topLeft",
      "topRight",
      "bottomLeft",
      "bottomRight",
      "top",
      "bottom",
      "left",
      "right",
    ].forEach((handle) => {
      cropPanResponders.current[handle as CropHandle] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          activeCropHandle.current = handle as CropHandle;
          cropStartRect.current = cropRectRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          updateCropByHandle(handle as CropHandle, gestureState.dx, gestureState.dy);
        },
        onPanResponderRelease: () => {
          activeCropHandle.current = null;
        },
      });
    });
  }

  const boxPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        cropStartRect.current = cropRectRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const start = cropStartRect.current;

        // Pure delta calculation
        const nextX = start.x + gestureState.dx;
        const nextY = start.y + gestureState.dy;

        // Route it through your clamp function to prevent out-of-bounds or NaN
        const nextRect = clampCropRect({
          x: nextX,
          y: nextY,
          width: start.width,
          height: start.height,
        });

        setCropRect(nextRect);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const initializeCropRect = () => {
    const frame = getDisplayedImageFrame();
    if (frame.width === 0 || frame.height === 0) return;
    setCropRect({
      x: frame.x + frame.width * 0.1,
      y: frame.y + frame.height * 0.1,
      width: frame.width * 0.8,
      height: frame.height * 0.8,
    });
  };

  useEffect(() => {
    if (cameraState === "cropping" && capturedPhoto && imageLayout.width > 0) {
      initializeCropRect();
    }
  }, [cameraState, capturedPhoto, imageLayout.width, imageLayout.height]);

  const handleConfirm = async () => {
    if (!capturedPhoto || !capturedImage) return;

    setCameraState("processing");
    openSheet();

    const frame = getDisplayedImageFrame();
    const scaleX = capturedPhoto.width / frame.width;
    const scaleY = capturedPhoto.height / frame.height;

    const crop = {
      originX: Math.max(0, Math.round((cropRect.x - frame.x) * scaleX)),
      originY: Math.max(0, Math.round((cropRect.y - frame.y) * scaleY)),
      width: Math.round(cropRect.width * scaleX),
      height: Math.round(cropRect.height * scaleY),
    };

    try {
      // 1. Perform the crop
      const croppedImage = await ImageManipulator.manipulateAsync(
        capturedPhoto.uri,
        [{ crop }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG } // Removed base64: true
      );

      // 2. Pass the URI directly to sendImage (NOT the base64 string)
      console.log("🚀 Gaming mode firing sendImage with URI:", croppedImage.uri);
      const resultData = await sendImage(croppedImage.uri, { mode: "gaming" });

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
      console.error("Gaming crop confirmation failed", err);
      setCameraState("preview");
    }
  };

  const handleRetake = () => {
    hideSheetCompletely();
    setCapturedImage(null);
    setCompressedBase64(null);
    setResult(null);
    setCapturedPhoto(null);
    setCropRect({ x: 0, y: 0, width: 0, height: 0 });
    setCameraState("preview");
  };

  useEffect(() => {
    const initializeCamera = async () => {
      const permissionResult = await requestPermission();
      if (permissionResult?.granted) {
        setPermissionDenied(false);
        setIsCameraActive(true);
        return;
      }

      setPermissionDenied(true);
    };

    initializeCamera();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        cameraState !== "cropping" && Math.abs(gestureState.dy) > 5,
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

  const handleStartScanning = async () => {
    const permissionResult = await requestPermission();
    if (permissionResult?.granted) {
      setPermissionDenied(false);
      setIsCameraActive(true);
      return;
    }

    setPermissionDenied(true);
  };

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
                <View style={styles.cropContainer} onLayout={(e) => setImageLayout(e.nativeEvent.layout)}>
                  <Image
                    source={{ uri: capturedImage }}
                    style={styles.camera}
                    resizeMode="contain"
                  />

                  {cameraState === "cropping" && (
                    <View style={styles.cropOverlayWrapper} pointerEvents="box-none">
                      <View style={styles.cropOverlay} pointerEvents="box-none">
                        <View
                          style={[styles.cropShadow, {
                            top: 0,
                            left: 0,
                            right: 0,
                            height: cropRect.y,
                          }]}
                        />
                        <View
                          style={[styles.cropShadow, {
                            top: cropRect.y,
                            left: 0,
                            width: cropRect.x,
                            height: cropRect.height,
                          }]}
                        />
                        <View
                          style={[styles.cropShadow, {
                            top: cropRect.y,
                            left: cropRect.x + cropRect.width,
                            right: 0,
                            height: cropRect.height,
                          }]}
                        />
                        <View
                          style={[styles.cropShadow, {
                            top: cropRect.y + cropRect.height,
                            left: 0,
                            right: 0,
                            bottom: 0,
                          }]}
                        />

                        <View
                          style={[styles.cropBox, {
                            left: cropRect.x,
                            top: cropRect.y,
                            width: cropRect.width,
                            height: cropRect.height,
                          }]}
                          pointerEvents="auto"
                          {...boxPanResponder.panHandlers}
                        />

                        {[
                          { handle: "topLeft", style: { left: cropRect.x - 14, top: cropRect.y - 14 } },
                          { handle: "topRight", style: { left: cropRect.x + cropRect.width - 14, top: cropRect.y - 14 } },
                          { handle: "bottomLeft", style: { left: cropRect.x - 14, top: cropRect.y + cropRect.height - 14 } },
                          { handle: "bottomRight", style: { left: cropRect.x + cropRect.width - 14, top: cropRect.y + cropRect.height - 14 } },
                          { handle: "top", style: { left: cropRect.x + cropRect.width / 2 - 14, top: cropRect.y - 14 } },
                          { handle: "bottom", style: { left: cropRect.x + cropRect.width / 2 - 14, top: cropRect.y + cropRect.height - 14 } },
                          { handle: "left", style: { left: cropRect.x - 14, top: cropRect.y + cropRect.height / 2 - 14 } },
                          { handle: "right", style: { left: cropRect.x + cropRect.width - 14, top: cropRect.y + cropRect.height / 2 - 14 } },
                        ].map(({ handle, style }) => (
                          <View
                            key={handle}
                            style={[styles.cropHandle, style]}
                            {...cropPanResponders.current[handle as CropHandle].panHandlers}
                          />
                        ))}

                        <TouchableOpacity
                          style={[styles.confirmCircle, {
                            left: cropRect.x + cropRect.width - 28,
                            top: cropRect.y - 16,
                          }]}
                          onPress={handleConfirm}
                        >
                          <Icon name="check" size={18} color="white" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>

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

  cropContainer: {
    flex: 1,
    backgroundColor: "black",
  },

  cropOverlayWrapper: {
    ...StyleSheet.absoluteFillObject,
  },

  cropOverlay: {
    ...StyleSheet.absoluteFillObject,
  },

  cropShadow: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  cropBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#7C3AED",
    backgroundColor: "transparent",
    zIndex: 10,
  },

  cropHandle: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#7C3AED",
    zIndex: 20,
  },

  confirmCircle: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    zIndex: 30,
  },

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
