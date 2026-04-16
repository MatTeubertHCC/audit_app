import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button } from 'react-native';
import { initWhisper } from 'whisper.rn';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Audio } from 'expo-av';

export default function App() {
  const [whisperContext, setWhisperContext] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);

  useEffect(() => {
    // Request audio permissions and set up audio mode
    const setupAudio = async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          console.error('Audio permission not granted');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.error('Failed to setup audio:', e);
      }
    };

    // Initialize the model when the app loads
    const setupWhisper = async () => {
      try {
        const fileName = 'ggml-tiny.en-q5_1.bin';
        const modelPath = FileSystem.documentDirectory + fileName;

        const fileInfo = await FileSystem.getInfoAsync(modelPath);
        if (!fileInfo.exists) {
          console.log('Copying model to documents directory...');

          const asset = Asset.fromModule(require('./assets/language_models/ggml-tiny.en-q5_1.bin'));
          await asset.downloadAsync();
          const localUri = asset.localUri || asset.uri;

          if (!localUri) {
            throw new Error('Asset URI is unavailable');
          }

          console.log('Asset URI:', localUri);
          await FileSystem.copyAsync({
            from: localUri,
            to: modelPath,
          });
          console.log('Successfully copied model to:', modelPath);
        }

        const context = await initWhisper({
          filePath: modelPath,
        });
        setWhisperContext(context);
        console.log('Whisper model loaded successfully!', modelPath);
      } catch (e) {
        console.error('Failed to load Whisper model:', e);
      }
    };

    setupAudio();
    setupWhisper();
  }, []);

  const startTranscribing = async () => {
    if (!whisperContext || isRecording) return;

    try {
      setIsRecording(true);
      setTranscription('Recording...');

      // Start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);

      // Record for 5 seconds
      setTimeout(async () => {
        await stopRecordingAndTranscribe();
      }, 5000);

    } catch (e) {
      console.error('Failed to start recording:', e);
      setTranscription('Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecordingAndTranscribe = async () => {
    if (!recording) return;

    try {
      setTranscription('Processing...');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (uri && whisperContext) {
        setTranscription('Transcribing...');

        const result = await whisperContext.transcribe(uri, {
          language: 'en',
          onProgress: (progress) => {
            console.log('Progress:', progress);
          },
        });

        setTranscription(result.result || 'No transcription');
      }
    } catch (e) {
      console.error('Failed to transcribe:', e);
      setTranscription('Failed to transcribe: ' + e.message);
    } finally {
      setIsRecording(false);
      setRecording(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Whisper AI Local</Text>
      <Button 
        title={
          !whisperContext 
            ? "Loading Model..." 
            : isRecording 
              ? "Recording... (5s)" 
              : "Start Recording & Transcribe"
        } 
        onPress={startTranscribing} 
        disabled={!whisperContext || isRecording}
      />
      <Text style={styles.transcription}>{transcription}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  text: { fontSize: 20, marginBottom: 20 },
  transcription: { marginTop: 20, fontSize: 16, textAlign: 'center' }
});