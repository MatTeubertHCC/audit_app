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
      setStatus('Recording and transcribing...');
      setIsRecording(true);
      setTranscription('Listening...');

      // 1. Start Whisper's native real-time audio engine
      const { stop, subscribe } = await whisperContext.transcribeRealtime({
        language: 'en',
      });

      subscribe((evt) => {
        const { isCapturing, data } = evt;
        
        // Update the screen dynamically as words come in
        if (data && data.result) {
          setTranscription(data.result);
        }

        if (!isCapturing) {
          setStatus('Complete');
          setIsRecording(false);
        }
      });

      setTimeout(() => {
        stop(); 
      }, 50000);

    } catch (e) {
      console.error('Failed to transcribe:', e);
      setTranscription('Transcription failed: ' + String(e));
      setStatus('Error');
      setIsRecording(false);
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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 1 },
  text: { fontSize: 20, marginBottom: 20 },
  spacer: { height: 16 },
  status: { marginTop: 12,
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    width: '100%',
    minHeight: 150,
    padding: 1,
    borderWidth: 1
  },
  error: { marginTop: 12, fontSize: 14, color: 'red', textAlign: 'center' },
  transcription: { 
    marginTop: 20, 
    fontSize: 12, 
    textAlign: 'left',
    width: '100%',
    minHeight: 150,
    padding: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 1,
    backgroundColor: '#f8f9fa'
  }
});