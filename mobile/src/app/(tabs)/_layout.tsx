import * as React from 'react'
import { View } from 'react-native'
import { Tabs } from 'expo-router/js-tabs'
import Feather from '@expo/vector-icons/Feather'
import { useTheme } from '~/theme'

/**
 * Five places, designed for a thumb: what is happening today, the people,
 * capturing a conversation, the map of who knows whom, and asking. Capture
 * sits in the middle because it is the one thing done during a meeting.
 */
export default function TabsLayout() {
  const { c } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line },
        tabBarLabelStyle: { fontFamily: 'InstrumentSans_500Medium', fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Feather name="sun" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="people"
        options={{ title: 'People', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="capture"
        options={{
          title: 'Capture',
          tabBarAccessibilityLabel: 'Capture a conversation',
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 44,
                height: 30,
                borderRadius: 15,
                backgroundColor: focused ? c.surfaceInverse : c.accentWash,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="mic" size={17} color={focused ? c.inkInverse : c.accent} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="atlas"
        options={{ title: 'Atlas', tabBarIcon: ({ color, size }) => <Feather name="compass" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="ask"
        options={{ title: 'Ask', tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
