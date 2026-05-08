import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#5B2BFF",
        tabBarInactiveTintColor: "#8A8A9A",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          height: Platform.select({ ios: 86, default: 68 }),
          paddingBottom: Platform.select({ ios: 20, default: 10 }),
          paddingTop: 8,
          backgroundColor: Colors[colorScheme ?? "light"].background,
          borderTopColor: "#E8E8EF",
        },
        tabBarLabelStyle: {
          fontWeight: "700",
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="home-filled" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Recorrido",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="alt-route" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bus"
        options={{
          title: "Bus",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="directions-bus" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
