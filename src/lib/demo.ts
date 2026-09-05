import type {
  Episode,
  EpisodesResponse,
  InstanceSummary,
  MediaItem,
  MediaStatus,
  QueueItem,
} from "./types";

export const demoInstances: InstanceSummary[] = [
  {
    id: "demo-radarr-hd",
    name: "Radarr HD",
    kind: "radarr",
    url: "https://radarr-hd.example.invalid",
    hasApiKey: false,
    connected: false,
  },
  {
    id: "demo-radarr-4k",
    name: "Radarr 4K",
    kind: "radarr",
    url: "https://radarr-4k.example.invalid",
    hasApiKey: false,
    connected: false,
  },
  {
    id: "demo-sonarr-hd",
    name: "Sonarr HD",
    kind: "sonarr",
    url: "https://sonarr-hd.example.invalid",
    hasApiKey: false,
    connected: false,
  },
  {
    id: "demo-sonarr-4k",
    name: "Sonarr 4K",
    kind: "sonarr",
    url: "https://sonarr-4k.example.invalid",
    hasApiKey: false,
    connected: false,
  },
];

const catalog: (Pick<
  MediaItem,
  | "kind"
  | "title"
  | "year"
  | "overview"
  | "genres"
  | "rating"
  | "runtime"
  | "tmdbId"
  | "tvdbId"
> & {
  image: string;
  hd: MediaStatus;
  uhd?: MediaStatus;
  episodes?: number;
})[] = [
  {
    kind: "movie",
    title: "Dune: Part Two",
    year: 2024,
    tmdbId: 693134,
    image: "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
    genres: ["Science Fiction", "Adventure"],
    rating: 8.5,
    runtime: 167,
    hd: "available",
    uhd: "available",
    overview:
      "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family. A choice between love and the fate of the universe lies ahead.",
  },
  {
    kind: "series",
    title: "Shogun",
    year: 2024,
    tmdbId: 126308,
    tvdbId: 392573,
    image: "/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg",
    genres: ["Drama", "War & Politics"],
    rating: 8.6,
    runtime: 60,
    episodes: 10,
    hd: "available",
    uhd: "downloading",
    overview:
      "In Japan in 1600, Lord Toranaga fights for his life as his enemies unite against him. A mysterious European ship brings a pilot whose secrets could change the balance of power.",
  },
  {
    kind: "movie",
    title: "Oppenheimer",
    year: 2023,
    tmdbId: 872585,
    image: "/ptpr0kGAckfQkJeJIt8st5dglvd.jpg",
    genres: ["Drama", "History"],
    rating: 8.1,
    runtime: 181,
    hd: "available",
    uhd: "available",
    overview:
      "The story of American physicist J. Robert Oppenheimer and his role in the development of the atomic bomb, a discovery that changes the world and shadows the rest of his life.",
  },
  {
    kind: "series",
    title: "The Bear",
    year: 2022,
    tmdbId: 136315,
    tvdbId: 403294,
    image: "/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg",
    genres: ["Drama", "Comedy"],
    rating: 8.3,
    runtime: 32,
    episodes: 28,
    hd: "available",
    uhd: "missing",
    overview:
      "A young chef from the fine-dining world returns to Chicago to run his family's sandwich shop. In a kitchen on the edge, an unlikely crew discovers what it means to take care of one another.",
  },
  {
    kind: "movie",
    title: "Poor Things",
    year: 2023,
    tmdbId: 792307,
    image: "/kCGlIMHnOm8JPXq3rXM6c5wMxcT.jpg",
    genres: ["Science Fiction", "Romance", "Comedy"],
    rating: 7.7,
    runtime: 142,
    hd: "available",
    uhd: "missing",
    overview:
      "Brought back to life by an unorthodox scientist, Bella Baxter sets out on a whirlwind adventure across continents, determined to discover the world on her own terms.",
  },
  {
    kind: "series",
    title: "Fallout",
    year: 2024,
    tmdbId: 106379,
    tvdbId: 416744,
    image: "/c15BtJxCXMrISLVmysdsnZUPQft.jpg",
    genres: ["Sci-Fi & Fantasy", "Action & Adventure"],
    rating: 8.3,
    runtime: 56,
    episodes: 8,
    hd: "downloading",
    uhd: "missing",
    overview:
      "Two hundred years after the apocalypse, a sheltered vault dweller ventures into an irradiated wasteland full of strange factions, hidden histories, and very bad decisions.",
  },
  {
    kind: "movie",
    title: "Blade Runner 2049",
    year: 2017,
    tmdbId: 335984,
    image: "/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",
    genres: ["Science Fiction", "Drama"],
    rating: 8.0,
    runtime: 164,
    hd: "available",
    uhd: "available",
    overview:
      "A young blade runner uncovers a secret that could plunge what remains of society into chaos. His search leads him to Rick Deckard, a former blade runner missing for thirty years.",
  },
  {
    kind: "series",
    title: "Severance",
    year: 2022,
    tmdbId: 95396,
    tvdbId: 371980,
    image: "/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
    genres: ["Drama", "Mystery", "Sci-Fi & Fantasy"],
    rating: 8.7,
    runtime: 50,
    episodes: 19,
    hd: "partial",
    uhd: "missing",
    overview:
      "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. A colleague's sudden disappearance reveals cracks in their carefully controlled world.",
  },
  {
    kind: "movie",
    title: "Interstellar",
    year: 2014,
    tmdbId: 157336,
    image: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    genres: ["Science Fiction", "Adventure", "Drama"],
    rating: 8.4,
    runtime: 169,
    hd: "available",
    uhd: "available",
    overview:
      "With Earth becoming uninhabitable, a team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars.",
  },
  {
    kind: "series",
    title: "The Last of Us",
    year: 2023,
    tmdbId: 100088,
    tvdbId: 392256,
    image: "/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
    genres: ["Drama", "Action & Adventure"],
    rating: 8.6,
    runtime: 59,
    episodes: 16,
    hd: "available",
    uhd: "downloading",
    overview:
      "A hardened survivor escorts a teenage girl across a ravaged America. Their dangerous journey becomes a story of trust, loss, and the lengths people go to for love.",
  },
  {
    kind: "movie",
    title: "The Batman",
    year: 2022,
    tmdbId: 414906,
    image: "/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    genres: ["Crime", "Mystery", "Thriller"],
    rating: 7.7,
    runtime: 177,
    hd: "available",
    uhd: "available",
    overview:
      "When a killer targets Gotham's elite, Batman follows a trail of cryptic clues into the city's underworld, where corruption reaches closer to home than he could have imagined.",
  },
  {
    kind: "series",
    title: "Silo",
    year: 2023,
    tmdbId: 125988,
    tvdbId: 406905,
    image: "/zBx1X06G1OlndbXTCZI13FECNz2.jpg",
    genres: ["Sci-Fi & Fantasy", "Drama"],
    rating: 8.2,
    runtime: 49,
    episodes: 20,
    hd: "available",
    overview:
      "In a ruined and toxic future, thousands live in a giant underground silo. An engineer begins to uncover the truth behind the rules that keep them safe, and keep them in the dark.",
  },
  {
    kind: "movie",
    title: "The Grand Budapest Hotel",
    year: 2014,
    tmdbId: 120467,
    image: "/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
    genres: ["Comedy", "Drama"],
    rating: 8.1,
    runtime: 100,
    hd: "available",
    overview:
      "A legendary concierge and his young lobby boy become entangled in the theft of a priceless painting and a battle for an enormous family fortune as Europe changes around them.",
  },
  {
    kind: "series",
    title: "Succession",
    year: 2018,
    tmdbId: 76331,
    tvdbId: 338186,
    image: "/7HW47XbkNQ5fiwQFYGWdw9gs144.jpg",
    genres: ["Drama", "Comedy"],
    rating: 8.4,
    runtime: 60,
    episodes: 39,
    hd: "available",
    uhd: "available",
    overview:
      "The Roy family controls one of the world's largest media empires. As its patriarch's health falters, his children maneuver for power, approval, and a place at the head of the table.",
  },
  {
    kind: "movie",
    title: "Past Lives",
    year: 2023,
    tmdbId: 666277,
    image: "/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg",
    genres: ["Drama", "Romance"],
    rating: 7.8,
    runtime: 106,
    hd: "missing",
    overview:
      "Two childhood friends, separated when one family emigrates from South Korea, reunite in New York for a week that asks what might have been and what makes a life.",
  },
  {
    kind: "series",
    title: "Andor",
    year: 2022,
    tmdbId: 83867,
    tvdbId: 393189,
    image: "/59SVNwLfoMnZPPB6ukW6dlPxAdI.jpg",
    genres: ["Sci-Fi & Fantasy", "Action & Adventure"],
    rating: 8.5,
    runtime: 45,
    episodes: 24,
    hd: "available",
    uhd: "missing",
    overview:
      "In an era of growing rebellion, Cassian Andor discovers the difference he can make. Ordinary people risk everything to resist an empire and build something larger than themselves.",
  },
  {
    kind: "movie",
    title: "Everything Everywhere All at Once",
    year: 2022,
    tmdbId: 545611,
    image: "/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg",
    genres: ["Action", "Adventure", "Science Fiction"],
    rating: 7.8,
    runtime: 139,
    hd: "available",
    uhd: "available",
    overview:
      "An exhausted laundromat owner is swept into an interdimensional adventure. To save the world, she must connect with the lives she could have led and the family in front of her.",
  },
  {
    kind: "series",
    title: "The White Lotus",
    year: 2021,
    tmdbId: 111803,
    tvdbId: 390430,
    image: "/gbSaK9v1CbcYH1ISgbM7XObD2dW.jpg",
    genres: ["Comedy", "Drama", "Mystery"],
    rating: 7.6,
    runtime: 58,
    episodes: 21,
    hd: "partial",
    overview:
      "Guests and employees at an exclusive resort collide over the course of a vacation, as privilege, desire, and carefully maintained appearances begin to unravel.",
  },
];

// A fixed sample collection, not a statement about a user's files or live availability.
export const demoLibrary: MediaItem[] = catalog.map((entry, index) => {
  const { image, hd, uhd, episodes, ...metadata } = entry;
  const service = entry.kind === "movie" ? "radarr" : "sonarr";
  const targets = [
    { tier: "hd", status: hd },
    ...(uhd ? [{ tier: "4k", status: uhd }] : []),
  ].map(({ tier, status }) => {
    const instance = demoInstances.find(
      (item) => item.id === `demo-${service}-${tier}`,
    );
    if (!instance) throw new Error("Invalid demo instance reference.");
    const files =
      episodes === undefined
        ? undefined
        : status === "available"
          ? episodes
          : status === "partial"
            ? Math.floor(episodes * 0.65)
            : 0;
    const size =
      status === "available" || status === "partial"
        ? (entry.kind === "movie"
            ? tier === "4k"
              ? 24
              : 7
            : (files ?? 0) * (tier === "4k" ? 3 : 1.2)) *
          1024 ** 3
        : 0;
    return {
      instanceId: instance.id,
      instanceName: instance.name,
      remoteId: index + 1,
      qualityProfileId: tier === "4k" ? 2 : 1,
      qualityProfile: tier === "4k" ? "Ultra-HD" : "HD-1080p",
      quality:
        status === "missing" || status === "downloading"
          ? "Not downloaded"
          : tier === "4k"
            ? "WEBDL-2160p"
            : "WEBDL-1080p",
      status,
      monitored: true,
      sizeOnDisk: Math.round(size),
      ...(episodes === undefined
        ? {}
        : { episodeCount: episodes, episodeFileCount: files }),
    };
  });
  const status: MediaStatus = targets.some(
    (target) => target.status === "downloading",
  )
    ? "downloading"
    : targets.every((target) => target.status === "available")
      ? "available"
      : targets.some(
            (target) =>
              target.status === "available" || target.status === "partial",
          )
        ? "partial"
        : "missing";
  return {
    ...metadata,
    id:
      entry.kind === "movie"
        ? `movie:tmdb:${entry.tmdbId}`
        : `series:tvdb:${entry.tvdbId}`,
    poster: `https://image.tmdb.org/t/p/w500${image}`,
    added: new Date(Date.UTC(2025, 5, 18 - index)).toISOString(),
    status,
    targets,
  };
});

export const demoDiscover: MediaItem[] = [
  {
    id: "movie:tmdb:329865",
    kind: "movie",
    title: "Arrival",
    year: 2016,
    tmdbId: 329865,
    poster: "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
    overview:
      "When mysterious spacecraft arrive on Earth, a linguist is recruited to understand their language. The answers challenge everything she knows about time, memory, and what it means to be human.",
    genres: ["Science Fiction", "Drama", "Mystery"],
    rating: 7.6,
    runtime: 116,
    added: "",
    status: "missing",
    targets: [],
  },
  {
    id: "movie:tmdb:244786",
    kind: "movie",
    title: "Whiplash",
    year: 2014,
    tmdbId: 244786,
    poster: "https://image.tmdb.org/t/p/w500/7fn624j5lj3xTme2SgiLCeuedmO.jpg",
    overview:
      "An ambitious young jazz drummer enrolls at a prestigious music conservatory, where a demanding instructor pushes him to the edge of his ability and his sanity.",
    genres: ["Drama", "Music"],
    rating: 8.4,
    runtime: 107,
    added: "",
    status: "missing",
    targets: [],
  },
  ...demoLibrary.map((item) => ({
    ...item,
    targets: [],
    status: "missing" as const,
    added: "",
  })),
];

export const demoQueue: QueueItem[] = [
  {
    media: 1,
    instanceId: "demo-sonarr-4k",
    title: "Shogun.S01E10.2160p.WEB-DL.DDP5.1.H.265",
    size: 5.8,
    remaining: 2.1,
    timeleft: "00:08:42",
  },
  {
    media: 5,
    instanceId: "demo-sonarr-hd",
    title: "Fallout.S01E01.1080p.WEB-DL.DDP5.1.H.264",
    size: 3.2,
    remaining: 2.4,
    timeleft: "00:14:18",
  },
  {
    media: 9,
    instanceId: "demo-sonarr-4k",
    title: "The.Last.of.Us.S02E01.2160p.WEB-DL.DDP5.1.H.265",
    size: 6.4,
    remaining: 0.9,
    timeleft: "00:03:51",
  },
].map((entry, index) => ({
  id: index + 1,
  instanceId: entry.instanceId,
  instanceName:
    demoInstances.find((instance) => instance.id === entry.instanceId)?.name ??
    "Sample Sonarr",
  title: entry.title,
  mediaTitle: demoLibrary[entry.media].title,
  kind: "series",
  poster: demoLibrary[entry.media].poster,
  quality: entry.instanceId.endsWith("4k") ? "WEBDL-2160p" : "WEBDL-1080p",
  size: Math.round(entry.size * 1024 ** 3),
  sizeleft: Math.round(entry.remaining * 1024 ** 3),
  status: "downloading",
  timeleft: entry.timeleft,
  downloadClient: "Sample qBittorrent",
  downloadId: `demo-download-${index + 1}`,
  warnings: [],
}));

export function demoEpisodes(
  instanceId: string,
  remoteId: number,
): EpisodesResponse | undefined {
  const instance = demoInstances.find(
    (entry) => entry.id === instanceId && entry.kind === "sonarr",
  );
  if (!instance) return undefined;
  const item = demoLibrary.find(
    (entry) =>
      entry.kind === "series" &&
      entry.targets.some(
        (target) =>
          target.instanceId === instanceId && target.remoteId === remoteId,
      ),
  );
  const target = item?.targets.find(
    (entry) => entry.instanceId === instanceId && entry.remoteId === remoteId,
  );
  if (!item || !target) return undefined;
  const count = target.episodeCount ?? 0;
  const fileCount = target.episodeFileCount ?? 0;
  const layouts: Record<number, number[]> = {
    392573: [10],
    371980: [9, 10],
    403294: [8, 10, 10],
    416744: [8],
    392256: [9, 7],
    406905: [10, 10],
    338186: [10, 10, 9, 10],
    393189: [12, 12],
    390430: [6, 7, 8],
  };
  const layout = layouts[item.tvdbId ?? 0] ?? [count];
  const lengths =
    layout.reduce((sum, length) => sum + length, 0) === count
      ? layout
      : [count];
  const shogunTitles = [
    "Anjin",
    "Servants of Two Masters",
    "Tomorrow Is Tomorrow",
    "The Eightfold Fence",
    "Broken to the Fist",
    "Ladies of the Willow World",
    "A Stick of Time",
    "The Abyss of Life",
    "Crimson Sky",
    "A Dream of a Dream",
  ];
  const download = demoQueue
    .find(
      (entry) =>
        entry.instanceId === instanceId && entry.mediaTitle === item.title,
    )
    ?.title.match(/\.S(\d+)E(\d+)\./);
  const baseSize =
    fileCount > 0 ? Math.floor(target.sizeOnDisk / fileCount) : 0;
  const remainder = fileCount > 0 ? target.sizeOnDisk % fileCount : 0;
  let index = 0;
  const episodes: Episode[] = lengths.flatMap((length, season) =>
    Array.from({ length }, (_, number) => {
      const position = index++;
      const hasFile = position < fileCount;
      const downloading =
        target.status === "downloading" &&
        Number(download?.[1]) === season + 1 &&
        Number(download?.[2]) === number + 1;
      return {
        id: remoteId * 1000 + position + 1,
        seriesId: remoteId,
        seasonNumber: season + 1,
        episodeNumber: number + 1,
        title:
          item.tvdbId === 392573
            ? (shogunTitles[position] ?? `Episode ${number + 1}`)
            : `Episode ${number + 1}`,
        overview: `Sample episode metadata for ${item.title}. Availability represents this demo target only.`,
        airDateUtc: new Date(
          Date.UTC(item.year, 0, 1 + position * 7),
        ).toISOString(),
        runtime: item.runtime,
        monitored: target.monitored,
        hasFile,
        quality: hasFile ? target.quality : "Not downloaded",
        sizeOnDisk: hasFile ? baseSize + (position < remainder ? 1 : 0) : 0,
        status: hasFile
          ? "available"
          : downloading
            ? "downloading"
            : target.monitored
              ? "missing"
              : "unmonitored",
      };
    }),
  );
  return {
    instanceId,
    instanceName: instance.name,
    remoteId,
    seasons: [
      { seasonNumber: 0, monitored: false },
      ...lengths.map((_, season) => ({
        seasonNumber: season + 1,
        monitored: target.monitored,
      })),
    ],
    episodes,
    demo: true,
    errors: [],
  };
}
