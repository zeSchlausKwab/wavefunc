// User profile data generation for the seed script.

import { faker } from "@faker-js/faker";
import type { ProfileContent } from "applesauce-core/helpers/profile";

const WALLETED_USER_LUD16 = "plebeianuser@coinos.io";

export function generateUserProfileData(userIndex?: number): ProfileContent {
  if (userIndex !== undefined) {
    faker.seed(userIndex + 1000);
  }

  const baseUsername = faker.internet.username().toLowerCase();

  return {
    name: baseUsername,
    display_name: faker.person.fullName(),
    picture: faker.image.urlPicsumPhotos({ width: 500, height: 500 }),
    banner: faker.image.urlPicsumPhotos({ width: 1200, height: 400 }),
    about: faker.lorem.paragraph(3),
    nip05: `${baseUsername}@example.com`,
    website: `https://${baseUsername}.com`,
    lud06: faker.finance.bitcoinAddress(),
    lud16: WALLETED_USER_LUD16,
  };
}
