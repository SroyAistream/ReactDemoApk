import React, { useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Platform 
} from 'react-native';
import { useDownloadsStore } from '../features/downloads/presentation/providers/downloads_provider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function DownloadsList() {
  const router = useRouter();
  const { downloads, loadDownloads, removeDownload } = useDownloadsStore();

  useEffect(() => {
    loadDownloads(); //
  }, []);

  const downloadedItems = downloads.filter(d => d.status === 'completed'); //
  const queuedItems = downloads.filter(d => d.status === 'pending' || d.status === 'downloading'); //

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.itemRow}>
      <View style={styles.infoContainer}>
        <Text style={styles.movieName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.statusRow}>
          {item.status === 'downloading' && (
            <ActivityIndicator size="small" color="#FF4D6D" style={{ marginRight: 6 }} />
          )}
          <Text style={[
            styles.statusText, 
            item.status === 'completed' ? styles.successText : styles.pendingText
          ]}>
            {item.status === 'completed' ? 'Ready for Offline' : 
             item.status === 'downloading' ? 'Downloading...' : 'Queued (Waiting for Hub)'}
          </Text>
        </View>
      </View>
      
      <View style={styles.actionContainer}>
        {item.status === 'completed' && (
          <TouchableOpacity 
            style={styles.iconBtn}
            onPress={() => router.push({ pathname: '/player', params: { movieId: item.movie_id } })}
          >
            <Ionicons name="play-circle" size={32} color="#FF4D6D" />
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={styles.iconBtn}
          onPress={() => removeDownload(item.movie_id)}
        >
          <Ionicons name="trash-outline" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {queuedItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Queued & Syncing</Text>
          <FlatList 
            data={queuedItems} 
            renderItem={renderItem} 
            keyExtractor={item => item.movie_id} 
            scrollEnabled={false}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Downloaded Content</Text>
        <FlatList 
          data={downloadedItems} 
          renderItem={renderItem} 
          keyExtractor={item => item.movie_id}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="cloud-download-outline" size={48} color="#374151" />
              <Text style={styles.emptyText}>No downloaded content yet.</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Matches your global theme[cite: 10]
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827', // Dark card background
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  infoContainer: {
    flex: 1,
  },
  movieName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 13,
  },
  successText: {
    color: '#10B981', // Emerald green for completed
  },
  pendingText: {
    color: '#F59E0B', // Amber for queued/downloading
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    opacity: 0.5,
  },
  emptyText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 15,
  },
});