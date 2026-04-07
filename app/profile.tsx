import { useRouter } from "expo-router";
import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from "react-native-vector-icons/MaterialIcons";
import { supabase } from '../supabase';
import { error } from "console";

// <-- Add this here, outside your component
export const ProfileScreenOptions = {
  headerShown: false, // hides the default header/back button
};

interface UserStats {
  username: string;
  email: string;
  totalWordsSaved: number;
  daysActive: number;
  wordsToday: number;
}

const ProfileScreen: React.FC = () => {
  const router = useRouter();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserStats = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setUserStats(null);
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, email, total_words_saved, streak_days')
        .eq('id', user.id)
        .single();

      if (profileError) console.error(profileError);

      const fetchTotalWordsSaved = async (userId: string) => {
        const { count, error } = await supabase
          .from('user_vocabs')
          .select('*', { count: 'exact' })
          .eq('user_id', userId);

        if (error) {
          console.error(error);
          return 0;
        }

        return count ?? 0;
      };

      const fetchWordsToday = async (userId: string) => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0); // midnight today

        const { count, error } = await supabase
          .from('user_vocabs')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .gte('updated_at', todayStart.toISOString());

        if (error) {
          console.error(error);
          return 0;
        }

        return count ?? 0;
      };

      const updateStreak = async (userId: string, wordsToday: number) => {
        if (wordsToday === 0) return 0; // nothing learned today

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('streak_days, last_active_date')
          .eq('id', userId)
          .single();

        if (error) return 0;

        const today = new Date();
        const lastActive = profile?.last_active_date ? new Date(profile.last_active_date) : null;

        let newStreak = 1;
        if (lastActive) {
          const diffDays = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) newStreak = profile.streak_days + 1;
          else if (diffDays === 0) newStreak = profile.streak_days; // same day
        }

        await supabase
          .from('profiles')
          .update({ streak_days: newStreak, last_active_date: today.toISOString() })
          .eq('id', userId);

        return newStreak;
      };

      const totalWords = await fetchTotalWordsSaved(user.id);
      const wordsToday = await fetchWordsToday(user.id);
      const updatedStreak = await updateStreak(user.id, wordsToday);

      setUserStats({
      username: profileData?.username ?? "No username",
      email: profileData?.email ?? user.email ?? "",
      totalWordsSaved: totalWords ?? 0,   // from user_vocabs
      daysActive: updatedStreak ?? 0, // or compute based on last_active_date
      wordsToday: wordsToday ?? 0,             // ✅ today’s progress
    });

      setLoading(false);
    };

    fetchUserStats();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      fetchUserStats();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // Loading
  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // Not logged in
  if (!userStats) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        {/* Back Button */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            style={styles.backButton}
          >
            <Icon name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.message}>You are not logged in</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push("/login")}
            activeOpacity={0.8}
          >
            <Text style={styles.loginButtonText}>Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Logged in
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back Button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
          style={styles.backButton}
        >
          <Icon name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{userStats.username}</Text>

        {/* Username and Email */}
        <Text style={styles.userInfo}>Email: {userStats.email}</Text>

        {/* Stats */}
        <View style={styles.statsContainer}>
          {/* Total Words - Main Focus */}
          <View style={styles.statRow}>
            <View style={styles.statIconContainer}>
              <Icon name="auto-stories" size={24} color="#6366F1" />
            </View>
            <View style={styles.statContent}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>Total Words</Text>
                <Text style={styles.statValueLarge}>{userStats.totalWordsSaved}</Text>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${Math.min((userStats.totalWordsSaved / 50) * 100, 100)}%` }]} />
              </View>
              <Text style={styles.microcopy}>You're building something great</Text>
            </View>
          </View>

          {/* Streak - Emotional Urgency */}
          <View style={styles.statRow}>
            <View style={[styles.statIconContainer, styles.streakIcon]}>
              <Icon name="local-fire-department" size={24} color="#F97316" />
            </View>
            <View style={styles.statContent}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>Streak</Text>
                <Text style={[styles.statValueMedium, styles.streakValue]}>{userStats.daysActive}</Text>
              </View>
              <View style={styles.streakDotsContainer}>
                {[...Array(7)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.streakDot,
                      i < userStats.daysActive ? styles.streakDotActive : styles.streakDotInactive
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.microcopyUrgent}>🔥 Keep it going!</Text>
            </View>
          </View>

          {/* Today's Progress - Encourage Action */}
          <View style={styles.statRow}>
            <View style={[styles.statIconContainer, styles.todayIcon]}>
              <Icon name="today" size={24} color="#10B981" />
            </View>
            <View style={styles.statContent}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>Today's Progress</Text>
                <Text style={styles.statValueMedium}>3</Text>
              </View>
              <View style={styles.progressBarContainerSmall}>
                <View style={[styles.progressBarGreen, { width: '60%' }]} />
              </View>
              <Text style={styles.microcopyAction}>1 more today? 💪</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Logout */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    // Increased top padding to ensure the back button 
    // clears the status bar/notch area
    paddingTop: 60, 
    paddingBottom: 32,
  },
  header: {
    width: '100%',
    // Ensuring the header stays at the top and doesn't 
    // get squashed by flexible content
    marginBottom: 20,
    minHeight: 40, 
    justifyContent: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    // Using padding for a larger touch target (better UX)
    paddingVertical: 8,
  },
  content: {
    // Removed flex: 1 and justifyContent: center 
    // to prevent the content from "taking over" the layout 
    // and hiding the header.
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  userInfo: {
    fontSize: 16,
    color: '#1A1A1A',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  statsContainer: {
    width: '100%',
    marginTop: 32,
    gap: 20,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    gap: 16,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakIcon: {
    backgroundColor: '#FFF7ED',
  },
  todayIcon: {
    backgroundColor: '#ECFDF5',
  },
  statContent: {
    flex: 1,
    gap: 6,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  statValueLarge: {
    fontSize: 32,
    fontWeight: '800',
    color: '#6366F1',
  },
  statValueMedium: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  streakValue: {
    color: '#F97316',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  progressBarContainerSmall: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarGreen: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  streakDotsContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  streakDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  streakDotActive: {
    backgroundColor: '#F97316',
  },
  streakDotInactive: {
    backgroundColor: '#E5E7EB',
  },
  microcopy: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  microcopyUrgent: {
    fontSize: 12,
    color: '#F97316',
    fontWeight: '600',
    marginTop: 2,
  },
  microcopyAction: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
    marginTop: 2,
  },
  buttonContainer: {
    marginTop: 'auto', // Pushes buttons to the bottom if there's space
    paddingTop: 40,
    width: '100%',
  },
  loginButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ProfileScreen;
