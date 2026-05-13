import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {
  useRoute,
  useNavigation,
  RouteProp,
  CommonActions,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import api from '../../services/api';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { RootStackParamList, User } from '../../types';

type Route = RouteProp<RootStackParamList, 'GroupSettings'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function GroupSettingsScreen() {
  const route = useRoute<Route>();
  const nav = useNavigation<Nav>();
  const { roomId } = route.params;
  const room = useChatStore((s) => s.rooms.find((r) => r.id === roomId));
  const updateGroup = useChatStore((s) => s.updateGroup);
  const addGroupMembers = useChatStore((s) => s.addGroupMembers);
  const removeGroupMember = useChatStore((s) => s.removeGroupMember);
  const transferGroupAdmin = useChatStore((s) => s.transferGroupAdmin);
  const leaveGroup = useChatStore((s) => s.leaveGroup);
  const currentUser = useAuthStore((s) => s.user);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const headerAccent = isDark ? '#86efac' : '#15803d';

  const isAdmin = room?.adminId === currentUser?.id;

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(room?.name || '');
  const [busy, setBusy] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setNewName(room?.name || '');
  }, [room?.name]);

  useEffect(() => {
    if (!addModalOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/search', { params: { q } });
        const existingIds = new Set(room?.members.map((m) => m.id) || []);
        setSearchResults(
          (data as User[]).filter((u) => !existingIds.has(u.id)),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [searchQuery, addModalOpen, room?.members]);

  const selectedToAddIds = useMemo(
    () => new Set(selectedToAdd.map((u) => u.id)),
    [selectedToAdd],
  );

  if (!room) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-page dark:bg-dark-200">
        <Text className="text-ink-500 dark:text-slate-300">
          Group not found
        </Text>
      </View>
    );
  }

  if (room.type !== 'group') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-page dark:bg-dark-200">
        <Text className="text-ink-500 dark:text-slate-300">
          This screen is only available for groups
        </Text>
      </View>
    );
  }

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === room.name) {
      setRenaming(false);
      setNewName(room.name || '');
      return;
    }
    setBusy(true);
    try {
      await updateGroup(roomId, { name: trimmed });
      setRenaming(false);
    } catch (e: any) {
      Alert.alert(
        'Rename failed',
        e?.response?.data?.message || 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (user: User) => {
    Alert.alert(
      'Remove member',
      `Remove ${user.name} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeGroupMember(roomId, user.id);
            } catch (e: any) {
              Alert.alert(
                'Failed',
                e?.response?.data?.message || 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleTransferAdmin = (user: User) => {
    Alert.alert(
      'Transfer admin',
      `Make ${user.name} the new admin? You will lose admin rights.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer',
          onPress: async () => {
            try {
              await transferGroupAdmin(roomId, user.id);
            } catch (e: any) {
              Alert.alert(
                'Failed',
                e?.response?.data?.message || 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleLeave = () => {
    if (isAdmin && room.members.length > 1) {
      Alert.alert(
        'Transfer admin first',
        'Pick a new admin before leaving the group.',
      );
      return;
    }
    Alert.alert(
      'Leave group',
      isAdmin && room.members.length === 1
        ? 'You are the only member. Leaving will delete this group.'
        : 'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup(roomId);
              nav.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'Main' }],
                }),
              );
            } catch (e: any) {
              Alert.alert(
                'Failed',
                e?.response?.data?.message || 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };

  const handleAddSelected = async () => {
    if (selectedToAdd.length === 0) return;
    setBusy(true);
    try {
      await addGroupMembers(
        roomId,
        selectedToAdd.map((u) => u.id),
      );
      setAddModalOpen(false);
      setSelectedToAdd([]);
      setSearchQuery('');
      setSearchResults([]);
    } catch (e: any) {
      Alert.alert(
        'Failed',
        e?.response?.data?.message || 'Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const sortedMembers = useMemo(() => {
    return [...room.members].sort((a, b) => {
      if (a.id === room.adminId) return -1;
      if (b.id === room.adminId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [room.members, room.adminId]);

  const renderMember = ({ item }: { item: User }) => {
    const isMemberAdmin = item.id === room.adminId;
    const isSelf = item.id === currentUser?.id;
    return (
      <View className="flex-row items-center px-4 py-3">
        <View className="w-11 h-11 rounded-full bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} className="w-11 h-11" />
          ) : (
            <Text className="text-primary-700 dark:text-primary-300 font-bold">
              {item.name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-ink-900 dark:text-white font-semibold text-base">
              {item.name}
            </Text>
            {isSelf && (
              <Text className="text-ink-400 dark:text-slate-400 text-xs ml-2">
                (you)
              </Text>
            )}
          </View>
          <View className="flex-row items-center mt-0.5">
            {isMemberAdmin && (
              <View className="bg-primary-100 dark:bg-primary-900 rounded-full px-2 py-0.5 mr-2">
                <Text className="text-primary-700 dark:text-primary-200 text-[10px] font-bold">
                  ADMIN
                </Text>
              </View>
            )}
            <Text className="text-ink-400 dark:text-slate-400 text-xs">
              {item.isOnline ? 'Online' : item.email}
            </Text>
          </View>
        </View>
        {isAdmin && !isSelf && (
          <View className="flex-row items-center">
            {!isMemberAdmin && (
              <TouchableOpacity
                onPress={() => handleTransferAdmin(item)}
                activeOpacity={0.7}
                className="p-2"
              >
                <Ionicons
                  name="key-outline"
                  size={20}
                  color={isDark ? '#94a3b8' : '#4b5563'}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => handleRemove(item)}
              activeOpacity={0.7}
              className="p-2"
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-surface-page dark:bg-dark-200">
      {/* Header */}
      <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => nav.goBack()} className="mr-2">
          <Ionicons name="chevron-back" size={26} color={headerAccent} />
        </TouchableOpacity>
        <Text className="text-ink-900 dark:text-white font-bold text-lg flex-1">
          Group settings
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Group avatar + name */}
        <View className="items-center py-6">
          <View className="w-24 h-24 rounded-3xl bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mb-3">
            {room.avatar ? (
              <Image source={{ uri: room.avatar }} className="w-24 h-24" />
            ) : (
              <Text className="text-primary-700 dark:text-primary-300 text-3xl font-bold">
                {(room.name || '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>

          {renaming ? (
            <View className="flex-row items-center px-6 w-full">
              <TextInput
                className="flex-1 bg-surface-card dark:bg-dark-100 text-ink-900 dark:text-white rounded-2xl px-4 py-2.5 text-base mr-2"
                value={newName}
                onChangeText={setNewName}
                autoFocus
                maxLength={60}
              />
              <TouchableOpacity
                onPress={handleSaveName}
                disabled={busy}
                className="bg-primary-600 rounded-full px-4 py-2"
              >
                {busy ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-white font-bold text-sm">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row items-center">
              <Text className="text-ink-900 dark:text-white text-xl font-bold">
                {room.name || 'Unnamed group'}
              </Text>
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => setRenaming(true)}
                  className="ml-2 p-1"
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={isDark ? '#94a3b8' : '#4b5563'}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}

          <Text className="text-ink-400 dark:text-slate-400 text-sm mt-1">
            {room.members.length} member
            {room.members.length > 1 ? 's' : ''}
          </Text>
        </View>

        {/* Members section */}
        <View className="flex-row items-center justify-between px-4 mb-2">
          <Text className="text-ink-500 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider">
            Members
          </Text>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => setAddModalOpen(true)}
              activeOpacity={0.7}
              className="flex-row items-center"
            >
              <Ionicons name="person-add" size={16} color={headerAccent} />
              <Text className="text-primary-700 dark:text-primary-300 text-sm font-semibold ml-1">
                Add
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="bg-surface-card dark:bg-dark-100 mx-2 rounded-2xl overflow-hidden">
          <FlatList
            scrollEnabled={false}
            data={sortedMembers}
            keyExtractor={(u) => u.id}
            renderItem={renderMember}
            ItemSeparatorComponent={() => (
              <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 ml-16" />
            )}
          />
        </View>

        {/* Danger zone */}
        <View className="mt-8 px-4">
          <TouchableOpacity
            onPress={handleLeave}
            activeOpacity={0.8}
            className="bg-red-50 dark:bg-red-900/30 rounded-2xl py-3 items-center flex-row justify-center"
          >
            <Ionicons name="exit-outline" size={18} color="#ef4444" />
            <Text className="text-red-600 dark:text-red-400 font-bold text-base ml-2">
              Leave group
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add members modal */}
      <Modal
        visible={addModalOpen}
        animationType="slide"
        onRequestClose={() => setAddModalOpen(false)}
      >
        <View className="flex-1 bg-surface-page dark:bg-dark-200">
          <View className="bg-surface-header dark:bg-dark-300 pt-14 pb-3 px-4 flex-row items-center">
            <TouchableOpacity
              onPress={() => {
                setAddModalOpen(false);
                setSelectedToAdd([]);
                setSearchQuery('');
              }}
              className="mr-2"
            >
              <Ionicons name="close" size={26} color={headerAccent} />
            </TouchableOpacity>
            <Text className="text-ink-900 dark:text-white font-bold text-lg flex-1">
              Add members
            </Text>
            <TouchableOpacity
              onPress={handleAddSelected}
              disabled={selectedToAdd.length === 0 || busy}
              activeOpacity={0.7}
              className={`px-4 py-2 rounded-full ${
                selectedToAdd.length > 0
                  ? 'bg-primary-600'
                  : 'bg-ink-200 dark:bg-slate-700'
              }`}
            >
              {busy ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text
                  className={`font-bold text-sm ${
                    selectedToAdd.length > 0
                      ? 'text-white'
                      : 'text-ink-400 dark:text-slate-400'
                  }`}
                >
                  Add ({selectedToAdd.length})
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View className="px-4 py-3">
            <View className="flex-row items-center bg-surface-card dark:bg-dark-100 rounded-2xl px-4 py-3">
              <Ionicons
                name="search"
                size={18}
                color={isDark ? '#64748b' : '#9ca3af'}
              />
              <TextInput
                className="flex-1 text-ink-900 dark:text-white text-base ml-2"
                placeholder="Search by name or email"
                placeholderTextColor={isDark ? '#64748b' : '#9ca3af'}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoFocus
              />
            </View>
          </View>

          {searching ? (
            <View className="items-center mt-4">
              <ActivityIndicator color="#16a34a" />
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(u) => u.id}
              ItemSeparatorComponent={() => (
                <View className="h-px bg-ink-200/40 dark:bg-slate-700/50 mx-4" />
              )}
              renderItem={({ item }) => {
                const isSelected = selectedToAddIds.has(item.id);
                return (
                  <TouchableOpacity
                    className="flex-row items-center px-4 py-3"
                    activeOpacity={0.7}
                    onPress={() =>
                      setSelectedToAdd((prev) =>
                        isSelected
                          ? prev.filter((u) => u.id !== item.id)
                          : [...prev, item],
                      )
                    }
                  >
                    <View className="w-11 h-11 rounded-full bg-primary-100 dark:bg-primary-900 items-center justify-center overflow-hidden mr-3">
                      {item.avatar ? (
                        <Image
                          source={{ uri: item.avatar }}
                          className="w-11 h-11"
                        />
                      ) : (
                        <Text className="text-primary-700 dark:text-primary-300 font-bold">
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-ink-900 dark:text-white font-semibold">
                        {item.name}
                      </Text>
                      <Text className="text-ink-400 dark:text-slate-400 text-sm">
                        {item.email}
                      </Text>
                    </View>
                    <View
                      className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                        isSelected
                          ? 'bg-primary-600 border-primary-600'
                          : 'border-ink-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color="#ffffff" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                searchQuery.trim().length < 2 ? (
                  <Text className="text-ink-400 dark:text-slate-400 text-center mt-8 px-8">
                    Type at least 2 characters to search teammates
                  </Text>
                ) : (
                  <Text className="text-ink-400 dark:text-slate-400 text-center mt-8">
                    No users found
                  </Text>
                )
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
