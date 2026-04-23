import type { PhoneToPcSpeakerApi } from '@phone-to-pc-speaker/shared-types';

declare global {
  interface Window {
    phoneToPcSpeaker: PhoneToPcSpeakerApi;
  }
}

export {};
