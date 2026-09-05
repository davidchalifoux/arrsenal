export const posterSources = [
  { hostname: "image.tmdb.org", pathname: "/t/p/" },
  { hostname: "artworks.thetvdb.com", pathname: "/banners/" },
  { hostname: "banners.thetvdb.com", pathname: "/banners/" },
];

export function isPosterSource(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.search &&
    posterSources.some(
      (source) =>
        url.hostname === source.hostname &&
        url.pathname.startsWith(source.pathname),
    )
  );
}
