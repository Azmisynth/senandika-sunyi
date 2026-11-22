import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider, useSession } from './src/lib/Session';
import AccountScreen from './src/screens/AccountScreen';
import DestinationScreen from './src/screens/DestinationScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import RateScreen from './src/screens/RateScreen';
import ReportScreen from './src/screens/ReportScreen';
import SavedScreen from './src/screens/SavedScreen';
import SignInScreen from './src/screens/SignInScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const palette = {
  background: '#FBF9F4',
  frame: '#EAECE4',
  ink: '#242A23',
  moss: '#2F493B',
  muted: '#596456',
  border: '#DCDDD1',
};

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.background,
    card: palette.background,
    text: palette.ink,
    border: palette.border,
    primary: palette.moss,
  },
};

const tabIcons = {
  Explore: ['compass-outline', 'compass'],
  Saved: ['bookmark-outline', 'bookmark'],
  Account: ['person-circle-outline', 'person-circle'],
};

function Dashboard() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.moss,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarLabelPosition: 'below-icon',
        tabBarIcon: ({ focused, color }) => (
          <Ionicons name={tabIcons[route.name][focused ? 1 : 0]} color={color} size={22} />
        ),
      })}
    >
      <Tabs.Screen name="Explore" component={ExploreScreen} options={{ title: 'Explore' }} />
      <Tabs.Screen name="Saved" component={SavedScreen} options={{ title: 'Saved' }} />
      <Tabs.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
    </Tabs.Navigator>
  );
}

const linking = {
  enabled: Platform.OS === 'web',
  prefixes: [],
  config: {
    screens: {
      Dashboard: { screens: { Explore: '', Saved: 'saved', Account: 'account' } },
      Destination: 'destinations/:slug',
      SignIn: 'sign-in',
      Rate: 'destinations/:slug/rate',
      Report: 'destinations/:slug/report',
    },
  },
};

function Navigator() {
  const { restoring } = useSession();
  if (restoring) {
    return (
      <View style={styles.loading} accessibilityLabel="Restoring session">
        <ActivityIndicator color={palette.moss} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme} linking={linking} documentTitle={{ enabled: false }}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: styles.screen }}>
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen name="Destination" component={DestinationScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Rate" component={RateScreen} />
        <Stack.Screen name="Report" component={ReportScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <View style={styles.frame}>
      <View style={styles.app}>
        <SafeAreaProvider>
          <SessionProvider>
            <StatusBar style="dark" />
            <Navigator />
          </SessionProvider>
        </SafeAreaProvider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignItems: 'center', backgroundColor: palette.frame },
  app: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 520 : undefined },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  screen: { backgroundColor: palette.background },
  tabBar: {
    backgroundColor: palette.background,
    borderTopColor: palette.border,
    paddingTop: 4,
    ...Platform.select({ web: { height: 64, paddingBottom: 7 } }),
  },
  tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
});
