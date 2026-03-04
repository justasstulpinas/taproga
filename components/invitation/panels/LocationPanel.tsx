import type { PanelInstance } from "@/lib/panels/panel.types";
import {
  INVITE_TEXT,
  getInviteText,
  hasVisibleText,
  resolveLocalizedString,
  type InvitationLanguage,
} from "../invitation.i18n";
import PanelContainer from "./PanelContainer";
import { getTextColor } from "./panel.utils";

type Props = {
  panel: PanelInstance;
  event: any;
  sectionId?: string;
  mockup: 1 | 2 | 3;
  language: InvitationLanguage;
};

export default function LocationPanel({
  panel,
  event,
  sectionId,
  mockup,
  language,
}: Props) {
  const text = getInviteText(language);
  const title = resolveLocalizedString(
    panel.content.title,
    language,
    INVITE_TEXT.lt.panels.location.title,
    INVITE_TEXT.en.panels.location.title
  );
  const venue = resolveLocalizedString(
    panel.content.venueName ?? panel.content.venue ?? event?.venue_name,
    language,
    INVITE_TEXT.lt.panels.location.venueName,
    INVITE_TEXT.en.panels.location.venueName
  );
  const address = resolveLocalizedString(
    panel.content.venueAddress ?? panel.content.address ?? event?.venue_address,
    language,
    INVITE_TEXT.lt.panels.location.venueAddress,
    INVITE_TEXT.en.panels.location.venueAddress
  );
  const imageUrl =
    panel.content.imageUrl ??
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80";
  const imageGrayscale = panel.content.imageGrayscale === true;
  const mapsQuery = [venue, address].filter(Boolean).join(" ").trim();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    mapsQuery
  )}`;
  const showTitle = hasVisibleText(title);
  const showVenue = hasVisibleText(venue);
  const showAddress = hasVisibleText(address);
  const imageAlt = showTitle ? title : text.panels.location.title;

  return (
    <PanelContainer panel={panel} sectionId={sectionId} mockup={mockup}>
      {showTitle ? (
        <h2
          className="invite-section-title invite-location-title"
          style={{ color: getTextColor(panel.styles?.titleColor) }}
        >
          {title}
        </h2>
      ) : null}

      <div className="invite-location-grid mt-12">
        <div className="invite-location-side">
          {showVenue ? (
            <p
              className="invite-location-line"
              style={{ color: getTextColor(panel.styles?.bodyColor) }}
            >
              {venue}
            </p>
          ) : null}
        </div>

        <div className="invite-location-image-wrap">
          <img
            src={imageUrl}
            alt={imageAlt}
            className={`invite-location-image ${
              imageGrayscale ? "invite-location-image-bw" : ""
            }`}
          />
          {mapsQuery ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="invite-location-action"
            >
              {text.panels.location.showMap}
            </a>
          ) : null}
        </div>

        <div className="invite-location-side">
          {showAddress ? (
            <p
              className="invite-location-line"
              style={{ color: getTextColor(panel.styles?.bodyColor) }}
            >
              {address}
            </p>
          ) : null}
        </div>
      </div>
    </PanelContainer>
  );
}
