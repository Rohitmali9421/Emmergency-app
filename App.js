import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
} from "react-native";
import { accelerometer } from "react-native-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GetLocation from "react-native-get-location";
import ImmediatePhoneCall from "react-native-immediate-phone-call";
import axios from "axios";
import Toast from "react-native-simple-toast";
import SystemSetting from "react-native-system-setting";
import LinearGradient from "react-native-linear-gradient";

const API_URL = "https://mailservice-blue.vercel.app/send-location";
const THRESHOLD = 15;
const REQUIRED_SHAKES = 3;
const SHAKE_WINDOW = 1000;
const MIN_SHAKE_INTERVAL = 300;
let shakeCount = 0;
let lastShakeTime = 0;
let lastEmergencyTime = 0;

const EmergencyApp = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [emails, setEmails] = useState(["", "", ""]);
  const [storedNumber, setStoredNumber] = useState(null);
  const [storedEmails, setStoredEmails] = useState([]);
  const [lastVolume, setLastVolume] = useState(null);
  const [volumeDownPressed, setVolumeDownPressed] = useState(false);
  const [volumeUpPressed, setVolumeUpPressed] = useState(false);
  const [isEmergencyTriggered, setIsEmergencyTriggered] = useState(false);

  useEffect(() => {
    SystemSetting.getVolume().then((vol) => setLastVolume(vol));

    const volumeListener = SystemSetting.addVolumeListener(({ value }) => {
      if (lastVolume !== null) {
        if (value > lastVolume) setVolumeUpPressed(true);
        if (value < lastVolume) setVolumeDownPressed(true);
        if (volumeUpPressed && volumeDownPressed) triggerEmergency();
      }
      setLastVolume(value);
    });

    return () => SystemSetting.removeVolumeListener(volumeListener);
  }, [lastVolume, volumeUpPressed, volumeDownPressed]);

  useEffect(() => {
    const getStoredData = async () => {
      const savedNumber = await AsyncStorage.getItem("emergency_number");
      const savedEmails = await AsyncStorage.getItem("receiver_emails");
      if (savedNumber) setStoredNumber(savedNumber);
      if (savedEmails) setStoredEmails(JSON.parse(savedEmails));
    };
    getStoredData();
  }, []);

  useEffect(() => {
    const subscription = accelerometer.subscribe(({ x, y, z }) => {
      const acceleration = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (acceleration > THRESHOLD) {
        if (now - lastShakeTime < MIN_SHAKE_INTERVAL) return;
        if (now - lastShakeTime < SHAKE_WINDOW) shakeCount += 1;
        else shakeCount = 1;
        lastShakeTime = now;
        if (shakeCount >= REQUIRED_SHAKES) triggerEmergency();
      }
    });

    return () => subscription.unsubscribe();
  }, [storedNumber, storedEmails]);

  const triggerEmergency = () => {
    const now = Date.now();
    if (now - lastEmergencyTime < 10000) return;
    lastEmergencyTime = now;

    if (!storedNumber || storedEmails.length === 0) {
      Alert.alert("No Emergency Contact", "Please set an emergency number and emails.");
      return;
    }

    sendLocation();
    ImmediatePhoneCall.immediatePhoneCall(storedNumber);
    setIsEmergencyTriggered(true);

    setTimeout(() => {
      setIsEmergencyTriggered(false);
      setVolumeUpPressed(false);
      setVolumeDownPressed(false);
    }, 5000);
  };

  const saveUserData = async () => {
    if (!phoneNumber || emails.some((email) => !email.includes("@"))) {
      Alert.alert("Invalid Input", "Enter a valid phone number and emails.");
      return;
    }
    await AsyncStorage.setItem("emergency_number", phoneNumber);
    await AsyncStorage.setItem("receiver_emails", JSON.stringify(emails));
    setStoredNumber(phoneNumber);
    setStoredEmails(emails);
    Toast.show("Emergency contacts saved!", Toast.SHORT);
  };

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return (
        granted["android.permission.CALL_PHONE"] === PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED
      );
    }
    return true;
  };

  const sendLocation = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert("Permissions Denied", "Grant location and call permissions.");
      return;
    }
    GetLocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 6000 })
      .then((location) => {
        const { latitude, longitude } = location;
        storedEmails.forEach((email) => {
          axios.post(API_URL, { latitude, longitude, email }).catch(() => {
            console.log("Failed to send location to", email);
          });
        });
      })
      .catch(() => console.log("Could not retrieve location."));
  };

  const resetUserData = async () => {
    Alert.alert("Reset Emergency Contacts", "Are you sure you want to reset?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        onPress: async () => {
          await AsyncStorage.clear();
          setStoredNumber(null);
          setStoredEmails([]);
          setPhoneNumber("");
          setEmails(["", "", ""]);
          Toast.show("Emergency contacts reset!", Toast.SHORT);
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={["#1E90FF", "#FFFFFF"]} style={styles.container}>
      <Text style={styles.header}>🚨 Emergency Alert</Text>

      {!storedNumber || storedEmails.length === 0 ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter Emergency Number"
            keyboardType="phone-pad"
            maxLength={10}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholderTextColor="#fff"
          />
          {emails.map((email, index) => (
            <TextInput
              key={index}
              style={styles.input}
              placeholder={`Enter Email ${index + 1}`}
              keyboardType="default"
              value={email}

              onChangeText={(text) => {
                const newEmails = [...emails];
                newEmails[index] = text;
                setEmails(newEmails);
              }}
              placeholderTextColor="#fff"
            />
          ))}
          <TouchableOpacity style={styles.button} onPress={saveUserData}>
            <Text style={styles.buttonText}>Save & Start</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.instructions}>
            Press both volume buttons or shake to trigger an alert.
          </Text>
          {isEmergencyTriggered && <Text style={styles.alertText}>🚨 Emergency Alert Sent!</Text>}
          <TouchableOpacity style={[styles.button, styles.resetButton]} onPress={resetUserData}>
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
        </>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { width: "100%", flex: 1, justifyContent: "center", alignItems: "center" },
  header: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  inputContainer: { width: "80%" },
  input: { height: 50, borderColor: "#fff", borderWidth: 1, borderRadius: 8, marginBottom: 12, paddingHorizontal: 10, color: "#fff" },
  button: { backgroundColor: "#fff", padding: 15, borderRadius: 8, alignItems: "center", marginBottom: 10 },
  resetButton: { backgroundColor: "#fff" },
  buttonText: { color: "#ff4b2b", fontWeight: "bold" },
  instructions: { fontSize: 16, color: "#fff", textAlign: "center" },
  alertText: { fontSize: 18, fontWeight: "bold", color: "#fff", marginTop: 10 },
});

export default EmergencyApp;
