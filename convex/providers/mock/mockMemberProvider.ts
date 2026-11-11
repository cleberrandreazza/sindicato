import type { MemberLookupInput, MemberLookupResult, MemberProvider } from '../memberProvider'
import { MOCK_MEMBERS } from './mockMembers'

export class MockMemberProvider implements MemberProvider {
  readonly name = 'mock'

  async lookupMember({ membershipNumber, cpf }: MemberLookupInput): Promise<MemberLookupResult> {
    const fixture = MOCK_MEMBERS.find(
      (entry) => entry.member.membershipNumber === membershipNumber && entry.cpf === cpf,
    )
    return fixture ? { found: true, member: fixture.member } : { found: false }
  }
}
