import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Button } from 'react-native';
import { initWhisper } from 'whisper.rn';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Audio } from 'expo-av';

export default function App() {
  const [whisperContext, setWhisperContext] = useState(null);
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState('Ready. Tap Load Model to begin.');
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);

  useEffect(() => {
    setStatus('Ready. Tap Load Model to begin.');
  }, []);

  const requestAudioPermissions = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Audio permission not granted');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  };

  const loadModel = async () => {
    
    if (modelLoading || whisperContext) return;

    try {
      setError(null);
      setModelLoading(true);
      setStatus('Requesting audio permissions...');
      await requestAudioPermissions();

      setStatus('Checking local model file...');
      const fileName = 'ggml-tiny.en-q5_1.bin';
      const modelPath = FileSystem.documentDirectory + fileName;

      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      if (!fileInfo.exists) {
        setStatus('Copying model to documents directory...');
        const asset = Asset.fromModule(require('./assets/language_models/ggml-tiny.en-q5_1.bin'));
        await asset.downloadAsync();
        const localUri = asset.localUri || asset.uri;

        if (!localUri) {
          throw new Error('Asset URI is unavailable');
        }

        await FileSystem.copyAsync({
          from: localUri,
          to: modelPath,
        });
      }

      setStatus('Initializing Whisper...');
      const context = await initWhisper({
        filePath: modelPath,
      });
      setWhisperContext(context);
      setStatus('Whisper model loaded successfully');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatus('Failed to load Whisper model');
      console.error('Failed to load Whisper model:', e);
    } finally {
      setModelLoading(false);
    }
  };

  const startTranscribing = async () => {
    if (!whisperContext || isRecording) return;

    try {
      setStatus('Recording audio...')
      setIsRecording(true);
      setTranscription('Listening...');

      const whisperRecordingOptions = {
        isMeteringEnabled: false,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.wav',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };

      const { recording: newRecording } = await Audio.Recording.createAsync(
        whisperRecordingOptions
      );
      setRecording(newRecording);

      // Pass the actual object into the function so it doesn't rely on React state
      setTimeout(async () => {
        await stopRecordingAndTranscribe(newRecording); 
      }, 2000);

    } catch (e) {
      console.error('Failed to start recording:', e);
      setTranscription('Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecordingAndTranscribe = async (currentRecording) => {
    if (!currentRecording) return;

    try {
      setStatus('Processing audio...');
      setTranscription('Processing...');
      
      // Use the passed argument, not the state variable
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (uri && whisperContext) {
        setStatus('Transcribing...');
        setTranscription('Transcribing...');

        const result = await whisperContext.transcribe(uri, {
          language: 'en',
          onProgress: (progress) => {
            console.log('Progress:', progress);
          },
        });

        setTranscription(result.result || 'No transcription');
        setStatus('Transcription complete');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setStatus('Failed to transcribe');
      console.error('Failed to transcribe:', e);
      setTranscription('Failed to transcribe: ' + message);
    } finally {
      setIsRecording(false);
      setRecording(null); // Clean up the state here
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Audit</Text>
      <Button
        title={modelLoading ? 'Loading Model...' : whisperContext ? 'Model Loaded' : 'Load Whisper Model'}
        onPress={loadModel}
        disabled={modelLoading || !!whisperContext}
      />
      <View style={styles.spacer} />
      <Button
        title={isRecording ? 'Recording... ' : 'Start Recording & Transcribe'}
        onPress={startTranscribing}
        disabled={!whisperContext || isRecording}
      />
      <Text style={styles.status}>{status}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.transcription}>{transcription}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  text: { fontSize: 20, marginBottom: 20 },
  spacer: { height: 16 },
  status: { marginTop: 12, fontSize: 16, color: '#333', textAlign: 'center' },
  error: { marginTop: 12, fontSize: 14, color: 'red', textAlign: 'center' },
  transcription: { marginTop: 20, fontSize: 16, textAlign: 'center' }
});