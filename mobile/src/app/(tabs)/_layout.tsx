import * as React from 'react'
import { View } from 'react-native'
import { Tabs } from 'expo-router/js-tabs'
import Feather from '@expo/vector-icons/Feather'
import { useTheme } from '~/theme'
import { useRecordingState } from '~/lib/recording-state'

/**
 * Five places, designed for a thumb: what is happening today, the people,
 * capturing a conversation, the map of who knows whom, and asking. Capture
 * sits in the middle because it is the one thing done during a meeting.
 */
export default function TabsLayout() {
  const { c } = useTheme()
  const recording = useRecordingState()
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
          title: recording === 'recording' ? 'Recording' : recording === 'paused' ? 'Paused' : 'Capture',
          tabBarAccessibilityLabel:
            recording === 'recording' ? 'Recording now. Open Capture' : recording === 'paused' ? 'Recording paused. Open Capture' : 'Capture a conversation',
          tabBarActiveTintColor: recording === 'recording' ? c.critical : c.ink,
          tabBarInactiveTintColor: recording === 'recording' ? c.critical : c.inkMuted,
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 44,
                height: 30,
                borderRadius: 15,
                backgroundColor: recording === 'recording' ? c.critical : focused ? c.surfaceInverse : c.accentWash,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather
                name={recording === 'paused' ? 'pause' : 'mic'}
                size={17}
                color={recording === 'recording' ? c.inkInverse : focused ? c.inkInverse : c.accent}
              />
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
