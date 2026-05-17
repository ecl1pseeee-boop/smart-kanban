export const boardRoom = (boardId: string): string => `board:${boardId}`

export function parseBoardRoom(room: string): string | null {
  return room.startsWith('board:') ? room.slice(6) : null
}
