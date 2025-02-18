export interface Comment {
  id: number;
  user: string;
  text: string;
  date: string;
}

export interface Station {
  id: number;
  name: string;
  genre: string;
  url: string;
  imageUrl: string;
  isUserOwned: boolean;
  description: string;
  streamIds: number[];
  commentIds: number[];
}

export interface Group {
  id: number;
  name: string;
  description: string;
  stationIds: number[];
}
