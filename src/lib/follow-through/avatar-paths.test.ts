import { describe, expect, it } from 'vitest'
import { ownAvatarPaths } from './send'

/**
 * The follow-through email signs photo paths with the service-role client,
 * which can read any object in the bucket. `avatar_path` is writable by the
 * account, so a path pointing into another account's folder must never be
 * signed -- that would leak a private photo across accounts.
 */
describe('ownAvatarPaths', () => {
  const me = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'

  it('keeps paths inside the account folder', () => {
    expect(ownAvatarPaths([{ avatar_path: `${me}/people/a.jpg` }], me)).toEqual([
      `${me}/people/a.jpg`,
    ])
  })

  it('drops another account’s paths, traversal and empties', () => {
    expect(
      ownAvatarPaths(
        [
          { avatar_path: `${other}/people/a.jpg` },
          { avatar_path: `${other}/profile.jpg` },
          { avatar_path: `${me}/../${other}/profile.jpg` },
          { avatar_path: `${me}` },
          { avatar_path: null },
          { avatar_path: '' },
        ],
        me,
      ),
    ).toEqual([])
  })
})
