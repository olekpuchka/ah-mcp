import type { AhClient } from "./client.ts";

/** Customer profile. */
export interface Member {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  postalCode: string;
  bonusCardNumber: string;
}

export async function getMember(c: AhClient): Promise<Member> {
  const query = `query Member {
  member {
    name { first last }
    emailAddress
    dateOfBirth
    address { postalCode }
    cards { bonus }
  }
}`;
  const { member: m } = await c.graphql<{
    member: {
      name?: { first?: string; last?: string };
      emailAddress?: string;
      dateOfBirth?: string;
      address?: { postalCode?: string };
      cards?: { bonus?: string };
    };
  }>(query);
  return {
    firstName: m.name?.first ?? "",
    lastName: m.name?.last ?? "",
    email: m.emailAddress ?? "",
    dateOfBirth: m.dateOfBirth ?? "",
    postalCode: m.address?.postalCode ?? "",
    bonusCardNumber: m.cards?.bonus ?? "",
  };
}
