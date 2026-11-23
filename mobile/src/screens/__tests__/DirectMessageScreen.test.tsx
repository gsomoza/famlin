import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { deleteChatMessage, fetchChatConversationMessages, fetchChatConversations } from '@famlin/api-client'

const mockNavigate = jest.fn()
let mockConversationId = 'private-1'
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useRoute: () => ({ params: { conversationId: mockConversationId } }),
  useIsFocused: () => true,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react')
    React.useEffect(effect, [effect])
  },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/components/Icon', () => ({ Icon: () => null }))
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }))
jest.mock('@/components/MediaThumbnail', () => ({ MediaThumbnail: () => null }))
jest.mock('@/components/ChatComposer', () => ({ ChatComposer: () => null }))
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: any) => selector({ user: { id: 'me' } }),
}))
jest.mock('@/i18n/utils', () => ({ formatRelativeDate: () => 'now' }))
jest.mock('@famlin/api-client', () => ({
  ...jest.requireActual('@famlin/api-client'),
  fetchChatConversations: jest.fn(),
  fetchChatConversationMessages: jest.fn(),
  markChatConversationRead: jest.fn().mockResolvedValue(undefined),
  deleteChatMessage: jest.fn(),
  sendChatConversationMessage: jest.fn(),
}))

import { DirectMessageScreen } from '../DirectMessageScreen'

const conversation = {
  id: 'private-1',
  kind: 'PRIVATE',
  group: null,
  participants: [
    { id: 'me', name: 'Gabriel', avatarUrl: null },
    { id: 'ana', name: 'Ana', avatarUrl: null },
  ],
  lastMessage: null,
  unreadCount: 0,
  updatedAt: '2026-11-23T18:00:00.000Z',
}

function message(id: string, authorId: string, encryption = 'none') {
  return {
    id,
    conversationId: 'private-1',
    groupId: null,
    authorId,
    author: { id: authorId, name: authorId === 'me' ? 'Gabriel' : 'Ana', avatarUrl: null },
    kind: 'USER',
    content: `message-${id}`,
    attachmentUrl: null,
    refPostId: null,
    createdAt: '2026-11-23T18:00:00.000Z',
    editedAt: null,
    encryption,
    encryptedPayload: null,
  }
}

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={client}>
      <DirectMessageScreen />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockConversationId = 'private-1'
  jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('only exposes confirmed deletion for own messages and repairs the conversation cache', async () => {
  jest.mocked(fetchChatConversations).mockResolvedValue({ items: [conversation] } as never)
  jest.mocked(fetchChatConversationMessages).mockResolvedValue({
    items: [message('mine', 'me'), message('theirs', 'ana')],
    nextCursor: null,
  })
  jest.mocked(deleteChatMessage).mockResolvedValue(undefined)
  await renderScreen()

  expect(await screen.findByText('message-mine')).toBeTruthy()
  expect(screen.getAllByLabelText('chat.deleteMessage')).toHaveLength(1)

  fireEvent.press(screen.getByLabelText('chat.deleteMessage'))
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2]
  await buttons.find((button: any) => button.style === 'destructive').onPress()

  await waitFor(() => expect(deleteChatMessage).toHaveBeenCalledWith('mine'))
  await waitFor(() => expect(screen.queryByText('message-mine')).toBeNull())
})

it('shows unsupported encrypted content as a privacy-safe placeholder', async () => {
  jest.mocked(fetchChatConversations).mockResolvedValue({ items: [conversation] } as never)
  jest.mocked(fetchChatConversationMessages).mockResolvedValue({
    items: [message('future', 'ana', 'future-cipher')],
    nextCursor: null,
  })
  await renderScreen()

  expect(await screen.findByText('chat.unsupportedEncryption')).toBeTruthy()
  expect(screen.queryByText('message-future')).toBeNull()
})

it('renders a localized unavailable state for stale conversation access', async () => {
  jest.mocked(fetchChatConversations).mockResolvedValue({ items: [] })
  await renderScreen()

  expect(await screen.findByText('chat.conversationUnavailable')).toBeTruthy()
})
