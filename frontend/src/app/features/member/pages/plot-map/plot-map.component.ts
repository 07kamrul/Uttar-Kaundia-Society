import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Subscription } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import * as L from 'leaflet';
import { ConfirmModalComponent } from '../../../../shared/confirm-modal/confirm-modal.component';
import { DagInfoDialogComponent, type DagTarget } from './dag-info-dialog/dag-info-dialog.component';
import { IconComponent, type IconName } from '../../../../shared/icon/icon.component';
import { AuthService } from '../../../../core/services/auth.service';
import { loadMapStyles } from '../../../../shared/map/load-map-styles';
import { FeatureFlagService } from '../../../../core/services/feature-flag.service';
import { LanguageService } from '../../../../core/services/language.service';
import { MemberService, type MemberProperty } from '../../../../core/services/member.service';
import { localizeDigits } from '../../../../core/services/roadmap.service';
import { PlotMapService } from '../../../../core/services/plot-map.service';
import {
  LandDataService,
  type LandFeatureCollection,
  type LandPlotFeature,
} from '../../../../core/services/land-data.service';
import { telHref, whatsAppHref } from '../../../../shared/phone-input/contact-links';
import { toAsciiDigits } from '../../../../core/services/digits.helper';
import {
  latLngsToGeometry,
  parseSocietyBbox,
} from '../../../../core/services/geo.helper';
import type {
  BoundaryOwner,
  MyBoundary,
  PlotFeature,
  PolygonGeometry,
} from '../../../../core/models/plot-boundary.model';
import { validateDrawing, type DrawValidation } from './boundary-validation';
import { hasStoredLayerPrefs, readLayerPrefs, writeLayerPrefs } from './layer-prefs';
import { outerRingLatLngs, rsLabelNumber, snapDistancePx } from './rs-labels';
import type { RsMatch } from './rs-match';
import {
  canRedo,
  canUndo,
  currentRing,
  emptyHistory,
  pushRing,
  redo as redoHistory,
  undo as undoHistory,
  type EditHistory,
} from './edit-history';
import { WIZARD_LEGEND, legendEntryFor } from './map-legend';
import { LayersSheetComponent } from './layers-sheet/layers-sheet.component';
import { MapTourComponent, isMapTourDone } from './map-tour/map-tour.component';
import { environment } from '../../../../../environments/environment';
import { PhoneTextPipe } from '../../../../shared/phone/phone-text.pipe';

const MOVE_DEBOUNCE_MS = 300;
// Uttar Kaundia mouza (Savar) — the society's actual location. The earlier
// [23.77, 90.39] pointed at Mirpur and left the mouza data in a corner.
const SOCIETY_CENTER: L.LatLngTuple = [23.809, 90.323];
const DISCLAIMER_KEY = 'krmf_boundary_disclaimer_dismissed';
/** map_wizard: the member chose to load map tiles in this session. */
export const TILES_OK_KEY = 'krmf_map_tiles_ok';
const MOUZA_CENTER: L.LatLngTuple = [23.7985, 90.3325];
const BDS_LABEL_MIN_ZOOM = 16;

export type PlotMapMode = 'boundaries' | 'bds';

/** Pane for the RS dag reference layer: below member polygons (overlayPane = 400). */
const RS_PANE = 'rsPane';
const RS_PANE_Z_INDEX = '390';
const RS_LABEL_MIN_ZOOM = 16;
/** Smaller parcels stay unlabeled until zoomed in, so labels thin out at low zoom. */
const RS_LABEL_MIN_PX = 22;
const RS_LABEL_ALL_ZOOM = 18;
const RS_STYLE: L.PathOptions = {
  color: '#b5530a',
  weight: 1.2,
  dashArray: '5,4',
  fillColor: '#e8a15a',
  fillOpacity: 0.06,
};
const SNAP_CUE_COLOR = '#ff6d00';
/** Searched-dag highlight; the pulse needs a CSS class, so it is drawn on an SVG copy. */
const SEARCH_HIT_STYLE: L.PathOptions = {
  color: '#e65100',
  weight: 4,
  fillColor: '#e65100',
  fillOpacity: 0.5,
  className: 'dag-search-hit',
};

/** Leaflet default marker/icons are unused; polygons only. */
const STATUS_COLORS: Record<string, string> = {
  pending: '#c9861e',
  approved: '#2e7d32',
  rejected: '#8a8a8a',
  superseded: '#b0a37f',
  withdrawn: '#8a8a8a',
  disputed: '#c0392b',
};
const MINE_COLOR = '#1e66d0';

const OWNER_ERROR_KEYS = {
  rateLimited: 'member.plotMap.owner.rateLimited',
  notApproved: 'member.plotMap.owner.notApproved',
  loadError: 'member.plotMap.owner.loadError',
} as const;

/** Maps owner-fetch failures to i18n keys - server text is never shown. */
export function ownerErrorKey(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return OWNER_ERROR_KEYS.loadError;
  const code =
    (error.error as { detail?: { code?: string } } | null)?.detail?.code ?? null;
  if (error.status === 429 || code === 'BOUNDARY_OWNER_RATE_LIMITED')
    return OWNER_ERROR_KEYS.rateLimited;
  if (error.status === 403 && code === 'BOUNDARY_NOT_APPROVED') return OWNER_ERROR_KEYS.notApproved;
  return OWNER_ERROR_KEYS.loadError;
}

const SAVE_ERROR_CODES = [
  'INVALID_GEOMETRY',
  'SELF_INTERSECTING',
  'OUTSIDE_SOCIETY_AREA',
  'ZERO_AREA',
  'TOO_MANY_VERTICES',
  'NOT_YOUR_PROPERTY',
  'BOUNDARY_EXISTS',
] as const;

/** Maps a failed create/update to a specific i18n key (never a generic banner). */
export function saveErrorKey(error: unknown): string {
  const code =
    error instanceof HttpErrorResponse
      ? ((error.error as { detail?: { code?: string } } | null)?.detail?.code ?? null)
      : null;
  if (code && (SAVE_ERROR_CODES as readonly string[]).includes(code)) {
    return `member.plotMap.draw.errors.${code}`;
  }
  return 'member.plotMap.draw.errors.generic';
}

/** Dag numbers compare as ASCII digits without the "RS-" prefix, so "4611",
 *  "RS-4611" and Bangla digits all resolve to the same plot. */
export function normalizeDagNo(value: string): string {
  return toAsciiDigits(value).trim().toUpperCase().replace(/^RS-?/, '');
}

export function boundaryErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const code =
      (error.error as { detail?: { code?: string } } | null)?.detail?.code ?? null;
    if (error.status === 429 || code === 'BOUNDARY_OWNER_RATE_LIMITED') {
      return OWNER_ERROR_KEYS.rateLimited;
    }
  }
  return saveErrorKey(error);
}

interface SelectedFeature {
  feature: PlotFeature;
  owner: BoundaryOwner | null;
  loading: boolean;
  errorKey: string | null;
  reported: boolean;
}

type DrawStep = 'idle' | 'pick' | 'draw';
export type WizardStep = 'find' | 'adjust' | 'submit';
type RsLookupState = 'idle' | 'loading' | 'found' | 'none' | 'error';
type RsMatchModule = typeof import('./rs-match');

@Component({
  selector: 'app-plot-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    TranslatePipe,
    IconComponent,
    ConfirmModalComponent,
    DagInfoDialogComponent,
    PhoneTextPipe,
    LayersSheetComponent,
    MapTourComponent,
  ],
  templateUrl: './plot-map.component.html',
  styleUrl: './plot-map.component.scss',
})
export class PlotMapComponent implements AfterViewInit {
  private readonly plotMapService = inject(PlotMapService);
  private readonly landDataService = inject(LandDataService);
  private readonly memberService = inject(MemberService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly flags = inject(FeatureFlagService);
  readonly lang = inject(LanguageService).lang;

  /** map_wizard: data-saver start, layers sheet, 3-step draw wizard, tour. Off = today's map. */
  readonly wizardOn = computed(() => this.flags.isEnabled('map_wizard'));

  readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');

  readonly features = signal<PlotFeature[]>([]);
  readonly mapLoading = signal(true);
  readonly disclaimer = signal<{ en: string; bn: string } | null>(null);
  readonly disclaimerDismissed = signal(this.readDisclaimerDismissed());
  readonly search = signal('');
  readonly myLocationError = signal(false);
  readonly outsideSociety = signal(false);
  /** BDS dag whose official-style info dialog is open (null = closed). The
   * polygon stays highlighted red while it is, even across bbox re-renders. */
  readonly dagDialog = signal<DagTarget | null>(null);

  // Polygon details sheet ("popup" rendered by Angular so it can be a bottom
  // sheet on touch screens and is fully testable).
  readonly selected = signal<SelectedFeature | null>(null);
  /** Container point of the clicked location; anchors the sheet on desktop. */
  readonly sheetPos = signal<{ x: number; y: number } | null>(null);
  private anchorLatLng: L.LatLng | null = null;

  // Draw flow.
  readonly canDraw = computed(() => this.auth.hasPermission('boundary.draw_own'));
  readonly drawStep = signal<DrawStep>('idle');
  readonly myBoundaries = signal<MyBoundary[]>([]);
  readonly availableProperties = computed(() => {
    const claimed = new Set(this.myBoundaries().map((b) => b.propertyId));
    return this.properties().filter((p) => !claimed.has(p.id));
  });
  readonly selectedPropertyId = signal<number | null>(null);
  readonly drawnGeometry = signal<PolygonGeometry | null>(null);
  readonly validation = computed(() =>
    validateDrawing(
      this.drawnGeometry(),
      this.declaredQuantity(),
      environment.societyBbox,
    ),
  );
  readonly saving = signal(false);
  readonly saveErrorKey = signal<string | null>(null);
  readonly editingBoundary = signal<MyBoundary | null>(null);
  /** Set when saving an edit while a review is already pending — saving replaces it. */
  readonly replaceTarget = signal<MyBoundary | null>(null);
  /** Boundary whose pending submission the member is withdrawing. */
  readonly withdrawTarget = signal<MyBoundary | null>(null);
  readonly withdrawing = signal(false);

  readonly reportOpen = signal(false);
  readonly reportNote = signal('');
  readonly reportSending = signal(false);
  readonly reportErrorKey = signal<string | null>(null);
  readonly reportSent = signal(false);

  readonly showDrawPanel = signal(false);

  // ---- map_wizard state ----
  readonly tilesOn = signal(false);
  readonly satelliteOn = signal(false);
  readonly showTileGate = computed(() => this.wizardOn() && !this.tilesOn());
  readonly layersSheetOpen = signal(false);
  readonly helpMenuOpen = signal(false);
  readonly noticeExpanded = signal(false);
  readonly tourOpen = signal(this.flags.isEnabled('map_wizard') && !isMapTourDone());
  readonly wizardLegend = WIZARD_LEGEND;
  readonly wizardStep = signal<WizardStep>('find');
  readonly wizardStepNumber = computed(() => ({ find: 1, adjust: 2, submit: 3 })[this.wizardStep()]);
  readonly rsLookup = signal<RsLookupState>('idle');
  readonly rsCandidates = signal<LandPlotFeature[]>([]);
  readonly rsCandidateIndex = signal(0);
  readonly chosenRs = signal<LandPlotFeature | null>(null);
  readonly otherDagQuery = signal('');
  readonly history = signal<EditHistory>(emptyHistory());
  /** True from the moment the draw tool starts until the polygon closes. */
  readonly freehand = signal(false);
  readonly freehandVertices = signal(0);
  readonly canUndoEdit = computed(() => (this.freehand() ? this.freehandVertices() > 0 : canUndo(this.history())));
  readonly canRedoEdit = computed(() => !this.freehand() && canRedo(this.history()));
  readonly selectedProperty = computed(() => this.properties().find((p) => p.id === this.selectedPropertyId()) ?? null);

  // Floating legend card: open by default on desktop, collapsed on phones.
  readonly legendOpen = signal(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 768px)').matches
      : true,
  );

  toggleLegend(): void {
    this.legendOpen.update((open) => !open);
  }

  // Map view modes: member boundaries (default), official BDS mouza map,
  // RAJUK DAP masterplan.
  readonly mapMode = signal<PlotMapMode>('boundaries');
  readonly externalLoading = signal(false);
  readonly rsLoading = signal(false);
  /** Spinner overlay while any official layer is still downloading. */
  readonly layerLoading = computed(() => this.externalLoading() || this.rsLoading());
  readonly externalError = signal(false);
  /** Server had more plots than the response cap — warn instead of losing them silently. */
  readonly externalTruncated = signal(false);
  readonly mapModes: Array<{ mode: PlotMapMode; labelKey: string; icon: IconName }> = [
    { mode: 'boundaries', labelKey: 'member.plotMap.views.boundaries', icon: 'edit' },
    { mode: 'bds', labelKey: 'member.plotMap.views.bds', icon: 'map' },
  ];

  // RS দাগ reference layer (RAJUK masterplan RS plots) + snapping, persisted per browser.
  private readonly layerPrefs = readLayerPrefs();
  // The wizard fetches the RS layer only when asked (switched on, or steps 1-2).
  readonly rsOverlayOn = signal(this.layerPrefs.rsOverlay && (!this.flags.isEnabled('map_wizard') || hasStoredLayerPrefs()));
  readonly snapEnabled = signal(this.layerPrefs.snapToRs);
  /** True while the cursor/vertex is snapped onto an RS dag edge or corner. */
  readonly isSnapped = signal(false);
  /** Mobile: layer switcher collapses into an expandable panel. */
  readonly layersPanelOpen = signal(false);
  private readonly rsCollection = signal<LandFeatureCollection | null>(null);
  private readonly isTouchDevice =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  /** How well the drawn shape matches the best RS dag (null = no overlap). Computed on demand (turf loads lazily). */
  readonly rsMatch = signal<RsMatch | null>(null);
  private rsMatchModule: RsMatchModule | null = null;
  private rsMatchLoading: Promise<RsMatchModule> | null = null;

  // Dag-number search on the official map views (BDS dag no / RAJUK RS dag no).
  readonly dagQuery = signal('');
  readonly dagNotFound = signal(false);
  /** Normalized dag number whose polygons stay highlighted on the layer. */
  readonly highlightDag = signal<string | null>(null);
  readonly dagSearchPlaceholderKey = computed(() =>
    this.mapMode() === 'bds'
      ? 'member.plotMap.views.bdsSearchPlaceholder'
      : 'member.plotMap.views.rsSearchPlaceholder',
  );

  private map: L.Map | null = null;
  private streetLayer: L.TileLayer | null = null;
  private satelliteLayer: L.TileLayer | null = null;
  private geomanReady: Promise<void> | null = null;
  /** Dynamic import of Geoman; a seam the tests replace. */
  protected loadGeomanModule: () => Promise<unknown> = () => import('../../../../shared/map/leaflet-geoman-setup');
  private resizeObserver: ResizeObserver | null = null;
  private readonly featureLayers = new Map<string, L.Polygon>();
  private moveDebounce: ReturnType<typeof setTimeout> | null = null;
  private featuresSub: Subscription | null = null;
  private drawnLayer: L.Polygon | null = null;
  private bdsLayer: L.GeoJSON | null = null;
  private rsLayer: L.GeoJSON | null = null;
  private rsSub: Subscription | null = null;
  private bdsSub: Subscription | null = null;
  private snapCue: L.CircleMarker | null = null;
  // The official layers hold thousands of polygons: one canvas per layer
  // draws them far faster than one SVG node each.
  private bdsRenderer: L.Canvas | null = null;
  private rsRenderer: L.Canvas | null = null;
  private searchHitLayer: L.GeoJSON | null = null;
  // The whole mouza fits one response and the map cannot leave the society
  // bbox, so each official layer is downloaded once (the service keeps it for
  // the session) and every pan/zoom re-renders from memory.
  private bdsCollection: LandFeatureCollection | null = null;

  private properties = signal<MemberProperty[]>([]);

  readonly legendItems: Array<{ status: string; color: string }> = [
    { status: 'approved', color: STATUS_COLORS['approved'] },
    { status: 'mine', color: MINE_COLOR },
    { status: 'pending', color: STATUS_COLORS['pending'] },
    { status: 'rejected', color: STATUS_COLORS['rejected'] },
    { status: 'disputed', color: STATUS_COLORS['disputed'] },
  ];

  constructor() {
    effect(() => {
      this.drawnGeometry();
      this.rsCollection();
      this.rsCandidates();
      untracked(() => void this.refreshRsMatch());
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initMap());
    // Today's map draws with Geoman at any time, so load it right away; the wizard waits for step 2.
    if (!this.wizardOn()) void this.ensureGeoman();
    this.loadProperties();
    this.loadFeatures();
    if (this.rsOverlayOn()) this.loadRsPlots();
    // Leaflet measures the container once at construction and never again;
    // the shell keeps settling afterwards (disclaimer text, fonts, legend,
    // sidebar, rotation), leaving tiles covering only part of the box. The
    // observer's initial callback also corrects any mis-measured first size.
    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.map?.remove();
      this.map = null;
    });
  }

  /** Society bbox as Leaflet bounds — the only area this map may show. */
  private societyBounds(): L.LatLngBounds {
    const [minLng, minLat, maxLng, maxLat] = parseSocietyBbox(environment.societyBbox);
    return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
  }

  /** True when a lat/lng point falls inside (a slightly padded) society bbox. */
  private insideSociety(lat: number, lng: number): boolean {
    const [minLng, minLat, maxLng, maxLat] = parseSocietyBbox(environment.societyBbox);
    const pad = 0.004; // ~400 m tolerance around the society edge
    return (
      lat >= minLat - pad && lat <= maxLat + pad && lng >= minLng - pad && lng <= maxLng + pad
    );
  }

  private initMap(): void {
    const society = this.societyBounds();
    // map.css loads on demand; re-measure once it is in.
    void loadMapStyles().then(() => this.map?.invalidateSize());
    const map = L.map(this.mapContainer().nativeElement, {
      center: SOCIETY_CENTER,
      zoom: 15,
      minZoom: 12,
      maxZoom: 19,
      maxBounds: society.pad(0.05),
      maxBoundsViscosity: 1.0,
      touchZoom: true,
      // Zoom/layers controls are re-added bottom-right; the top corners host
      // the app's own floating toolbar and view switcher.
      zoomControl: false,
    });
    // A natural fitBounds of the mouza bbox lands at ~z13, which reads as
    // "middle of nowhere" — start at z14 so the mouza fills the view.
    map.setView(SOCIETY_CENTER, 14);
    // RS dag parcels sit under member polygons; Geoman snaps to them for any pane.
    map.createPane(RS_PANE).style.zIndex = RS_PANE_Z_INDEX;

    const street = L.tileLayer(environment.mapTileUrl, {
      maxZoom: 19,
      // keepBuffer renders tiles beyond the viewport edge so panning shows no
      // grey; updateWhenZooming skips tile requests for the transient
      // intermediate zoom during pinch/zoom animations.
      keepBuffer: 3,
      updateWhenZooming: false,
      attribution: '© OpenStreetMap contributors',
    });
    const satellite = L.tileLayer(environment.satelliteTileUrl, {
      maxZoom: 19,
      keepBuffer: 3,
      updateWhenZooming: false,
      attribution: '© Esri World Imagery',
    });
    this.streetLayer = street;
    this.satelliteLayer = satellite;
    this.map = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    if (this.wizardOn()) {
      // Data-saver start: society outline on a plain background, tiles only on request.
      L.rectangle(society, { color: '#2e5138', weight: 2, fill: false, interactive: false, snapIgnore: true } as L.PolylineOptions).addTo(map);
      if (this.tilesAllowed()) this.addBaseTiles();
    } else {
      street.addTo(map);
      L.control
        .layers(
          { Street: street, Satellite: satellite },
          {},
          { position: 'bottomright' },
        )
        .addTo(map);
    }

    // Re-measure whenever the container's box changes. initMap runs outside
    // the Angular zone, so these callbacks never trigger change detection.
    this.resizeObserver = new ResizeObserver(() => map.invalidateSize());
    this.resizeObserver.observe(this.mapContainer().nativeElement);

    map.on('moveend', () => {
      if (this.moveDebounce) clearTimeout(this.moveDebounce);
      this.moveDebounce = setTimeout(() => this.zone.run(() => this.onViewMoved()), MOVE_DEBOUNCE_MS);
    });
    // RAJUK popups fill in after open; re-run layout so they stay below the
    // floating top bar.
    map.on('popupopen', (event: L.PopupEvent) => {
      const popup = event.popup;
      setTimeout(() => popup.update(), MOVE_DEBOUNCE_MS + 50);
      requestAnimationFrame(() => popup.update());
    });
    map.on('zoomend', () =>
      this.zone.runOutsideAngular(() => {
        this.updateBdsLabels();
        this.updateRsLabels();
      }),
    );
    map.on('move', () => this.updateSheetPos());

    map.on('pm:drawstart', (event: { workingLayer?: L.Layer }) => this.bindSnapCue(event.workingLayer));
    map.on('pm:drawend', () => this.clearSnapCue());
    map.on('pm:drawmove', () => this.zone.run(() => this.syncDrawnGeometry()));
    map.on('pm:vertexadded', () =>
      this.zone.run(() => {
        this.syncDrawnGeometry();
        if (this.freehand()) this.freehandVertices.update((n) => n + 1);
      }),
    );
    map.on('pm:change', () => this.zone.run(() => this.syncDrawnGeometry()));
    map.on('pm:create', (event: { layer: L.Layer }) => {
      this.zone.run(() => {
        this.drawnLayer = event.layer as L.Polygon;
        this.freehand.set(false);
        this.syncDrawnGeometry();
        this.recordSnapshot();
        this.attachEditListeners(this.drawnLayer);
      });
    });

    this.applyDrawingMode();
    this.prefetchOfficialLayers();
  }

  /**
   * Starts both official-layer downloads as soon as the map exists, so
   * switching to the BDS / RS view renders from the warm service cache
   * instead of waiting on the network. Failures are not cached by the
   * service; the real load surfaces the error and retries.
   */
  private prefetchOfficialLayers(): void {
    if (this.wizardOn()) return; // data-saver mode downloads layers only on request
    const bbox = this.societyLayerBbox();
    const ignore = { error: () => undefined };
    this.landDataService.dagsInBbox(bbox).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ignore);
    this.landDataService.masterplanInBbox(bbox).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(ignore);
  }

  // ---- map_wizard: tiles, Geoman and RS-match loading ---------------------

  private tilesAllowed(): boolean {
    try {
      return sessionStorage.getItem(TILES_OK_KEY) === '1';
    } catch {
      return false;
    }
  }

  private addBaseTiles(): void {
    const map = this.map;
    const layer = this.satelliteOn() ? this.satelliteLayer : this.streetLayer;
    if (!map || !layer) return;
    layer.addTo(map);
    this.tilesOn.set(true);
  }

  /** "মানচিত্র দেখুন": adds the street layer and remembers the choice for this session. */
  requestTiles(): void {
    this.addBaseTiles();
    try {
      sessionStorage.setItem(TILES_OK_KEY, '1');
    } catch {
      // private mode: the card simply shows again on reload
    }
  }

  toggleSatellite(): void {
    const map = this.map;
    const was = this.satelliteOn();
    this.satelliteOn.set(!was);
    if (!map || !this.tilesOn()) return;
    const from = was ? this.satelliteLayer : this.streetLayer;
    const to = was ? this.streetLayer : this.satelliteLayer;
    if (from) map.removeLayer(from);
    to?.addTo(map);
  }

  /** Geoman must be loaded before a map can draw; it attaches itself to a map created earlier. */
  private ensureGeoman(): Promise<void> {
    this.geomanReady ??= this.loadGeomanModule().then(() => {
      const map = this.map as (L.Map & { pm?: unknown }) | null;
      const pmApi = this.geomanApi();
      if (map && !map.pm && pmApi?.Map) map.pm = new pmApi.Map(map) as never;
      this.applyDrawingMode();
    });
    return this.geomanReady;
  }

  /** Geoman registers `L.PM` as a side effect of loading; it does not exist before that. */
  private geomanApi(): { Map?: new (m: L.Map) => unknown } | undefined {
    try {
      return (L as unknown as { PM?: { Map?: new (m: L.Map) => unknown } }).PM;
    } catch {
      return undefined;
    }
  }

  private loadRsMatch(): Promise<RsMatchModule> {
    this.rsMatchLoading ??= import('./rs-match').then((module) => (this.rsMatchModule = module));
    return this.rsMatchLoading;
  }

  private async refreshRsMatch(): Promise<void> {
    const geometry = this.drawnGeometry();
    const features = [...(this.rsCollection()?.features ?? []), ...this.rsCandidates()];
    if (!geometry || features.length === 0) {
      this.rsMatch.set(null);
      return;
    }
    const module = await this.loadRsMatch();
    if (geometry !== this.drawnGeometry()) return; // a newer shape is being matched
    try {
      this.rsMatch.set(module.bestRsMatch(geometry, features));
    } catch {
      this.rsMatch.set(null); // half-drawn ring: no summary yet
    }
  }

  // ---- Data loading -------------------------------------------------------

  /** Reload whichever layer the active map view needs. */
  private onViewMoved(): void {
    if (this.rsOverlayOn() || this.drawStep() === 'draw') this.loadRsPlots();
    this.updateRsLabels();
    if (this.mapMode() === 'bds') {
      this.loadBdsMouza();
      this.updateBdsLabels();
    } else if (this.mapMode() === 'boundaries') {
      this.loadFeatures();
    }
  }

  private bboxString(): string {
    return this.map
      ? this.map.getBounds().toBBoxString()
      : parseSocietyBbox(environment.societyBbox).join(',');
  }

  loadFeatures(): void {
    this.featuresSub?.unsubscribe();
    this.featuresSub = this.plotMapService
      .listFeatures(this.bboxString())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.disclaimer.set({ en: page.disclaimerEn, bn: page.disclaimerBn });
          this.features.set(page.features);
          this.mapLoading.set(false);
          this.renderFeatures();
        },
        error: () => {
          this.mapLoading.set(false);
        },
      });
  }

  private loadProperties(): void {
    this.memberService
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.properties.set(profile.properties);
          if (this.drawStep() !== 'idle') this.plotMapService.listMine().subscribe({
            next: (mine) => this.myBoundaries.set(mine),
          });
        },
        error: () => this.properties.set([]),
      });
  }

  private renderFeatures(): void {
    const map = this.map;
    if (!map) return;
    for (const layer of this.featureLayers.values()) {
      map.removeLayer(layer);
    }
    this.featureLayers.clear();

    const wizard = this.wizardOn();
    for (const feature of this.features()) {
      if (!this.featureLayerVisible(feature)) continue;
      // map_wizard: rejected/withdrawn/superseded shapes are not drawn at all.
      const entry = wizard ? legendEntryFor(feature.reviewStatus, feature.isMine) : null;
      if (wizard && !entry) continue;
      // Live shapes are solid; the owner's pending/rejected proposal is dashed.
      const isProposal = entry ? entry.dashed : feature.isMine && feature.reviewStatus !== 'approved';
      const layer = L.polygon(this.geoRingToLatLngs(feature.geometry), {
        color: entry ? entry.colour : this.featureColor(feature),
        weight: 2,
        fillOpacity: 0.25,
        dashArray: isProposal ? '6,6' : undefined,
        snapIgnore: true,
      } as L.PolylineOptions);
      layer.on('click', (event) =>
        this.zone.run(() => this.onFeatureClick(feature, (event as L.LeafletMouseEvent).latlng)),
      );
      layer.addTo(map);
      this.featureLayers.set(`${feature.boundaryId}:${feature.reviewStatus}`, layer);
    }
  }

  // ---- Map view modes (boundaries / BDS / RAJUK) ---------------------------

  selectMapMode(mode: PlotMapMode): void {
    if (this.mapMode() === mode) {
        return;
    }
    this.cancelDraw();
    this.closeSheet();
    this.dagDialog.set(null);
    this.externalError.set(false);
    this.externalTruncated.set(false);
    this.mapMode.set(mode);

    const map = this.map;
    if (!map) return;

    // Search and draw only apply to the member boundary view.
    if (mode !== 'boundaries') {
      this.search.set('');
      this.renderFeatures(); // hides member polygons filtered by cleared search
    }
    // The dag search is mode-specific (BDS dag no vs RS dag no).
    this.clearDagSearch();

    if (mode === 'bds') {
      this.loadBdsMouza();
    } else {
      this.removeBdsLayer();
    }
  }

  // ---- RS দাগ overlay (RAJUK masterplan RS plots) ---------------------------

  toggleRsOverlay(): void {
    this.setRsOverlay(!this.rsOverlayOn());
  }

  private setRsOverlay(on: boolean): void {
    this.rsOverlayOn.set(on);
    this.persistLayerPrefs();
    this.applyDrawingMode();
    if (on) {
      this.loadRsPlots();
    } else {
      this.removeRsLayer();
    }
  }

  toggleSnap(): void {
    this.snapEnabled.update((enabled) => !enabled);
    this.persistLayerPrefs();
    this.applyDrawingMode();
    if (!this.snapEnabled()) this.clearSnapCue();
  }

  toggleLayersPanel(): void {
    this.layersPanelOpen.update((open) => !open);
  }

  /** map_wizard: "আরও লেয়ার" sheet and the "?" menu. */
  openLayersSheet(): void {
    this.layersSheetOpen.set(true);
  }

  closeLayersSheet(): void {
    this.layersSheetOpen.set(false);
  }

  restartTour(): void {
    this.helpMenuOpen.set(false);
    this.tourOpen.set(true);
  }

  private persistLayerPrefs(): void {
    writeLayerPrefs({ rsOverlay: this.rsOverlayOn(), snapToRs: this.snapEnabled() });
  }

  /** Geoman options shared by drawing and vertex editing. */
  private snapOptions(): Record<string, unknown> {
    return {
      snappable: this.snapEnabled() && this.rsOverlayOn(),
      snapDistance: snapDistancePx(this.isTouchDevice),
      snapSegment: true,
      snapVertex: true,
    };
  }

  /** Pushes the current snap settings to Geoman, including a draw in progress. */
  private applyDrawingMode(): void {
    const map = this.map;
    if (!map) return;
    this.mapContainer().nativeElement.classList.toggle('rs-drawing', this.drawStep() === 'draw');
    if (!map.pm) return; // Geoman is still loading; ensureGeoman() calls this again
    const options = this.snapOptions();
    map.pm.setGlobalOptions(options as never);
    const draw = (map.pm.Draw as unknown as Record<string, { setOptions?: (o: unknown) => void }>)['Polygon'];
    draw?.setOptions?.(options);
    this.drawnLayer?.pm?.setOptions(options as never);
  }

  /** Orange ring where the vertex has snapped onto an RS dag boundary. */
  private bindSnapCue(layer: L.Layer | undefined): void {
    layer?.on('pm:snap', (event: unknown) => {
      const latlng = (event as { snapLatLng?: L.LatLng }).snapLatLng;
      if (!latlng || !this.map) return;
      this.snapCue?.remove();
      this.snapCue = L.circleMarker(latlng, {
        radius: 9,
        color: SNAP_CUE_COLOR,
        weight: 3,
        fillOpacity: 0.25,
        interactive: false,
        snapIgnore: true,
      } as L.CircleMarkerOptions).addTo(this.map);
      this.zone.run(() => this.isSnapped.set(true));
    });
    layer?.on('pm:unsnap', () => this.zone.run(() => this.clearSnapCue()));
  }

  private clearSnapCue(): void {
    this.snapCue?.remove();
    this.snapCue = null;
    this.isSnapped.set(false);
  }

  /** Both official layers are requested for the whole society area. */
  private societyLayerBbox(): string {
    return parseSocietyBbox(environment.societyBbox).join(',');
  }

  private loadBdsMouza(): void {
    if (!this.map) return;
    if (this.bdsCollection) {
      this.externalTruncated.set(!!this.bdsCollection.truncated);
      if (!this.bdsLayer) this.renderBds(this.bdsCollection);
      return;
    }
    if (this.bdsSub && !this.bdsSub.closed) return; // already downloading
    this.externalLoading.set(true);
    this.bdsSub = this.landDataService
      .dagsInBbox(this.societyLayerBbox())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (collection) => {
          this.externalLoading.set(false);
          this.bdsCollection = collection;
          if (this.mapMode() !== 'bds' || !this.map) return;
          this.externalTruncated.set(!!collection.truncated);
          this.renderBds(collection);
        },
        error: () => {
          this.externalLoading.set(false);
          this.externalError.set(true);
        },
      });
  }

  /** Shared popup options for the BDS / RAJUK layers. The popup must never
   * slide under (or tower over) the floating top bar: cap its height so long
   * khatian tables scroll, and make Leaflet's auto-pan keep the popup below
   * the top bar instead of butting against the map edge. */
  private externalPopupOptions(): L.PopupOptions {
    const bar = document.querySelector<HTMLElement>('.map-topbar');
    const topClearance = bar ? bar.offsetTop + bar.offsetHeight + 12 : 24;
    return {
      maxWidth: 460,
      minWidth: 280,
      maxHeight: 340,
      autoPanPaddingTopLeft: L.point(20, topClearance),
      autoPanPaddingBottomRight: L.point(20, 20),
    };
  }

  private renderBds(collection: LandFeatureCollection): void {
    const map = this.map;
    if (!map) return;
    this.removeBdsLayer();
    this.bdsRenderer ??= L.canvas();
    // `renderer` is valid on Leaflet path options but missing from GeoJSONOptions typings.
    const options = {
      renderer: this.bdsRenderer,
      snapIgnore: true,
      style: (feature?: unknown) => this.bdsStyle((feature as LandPlotFeature | undefined)?.properties),
      onEachFeature: (feature: unknown, layer: L.Layer) =>
        layer.on('click', () =>
          this.zone.run(() => this.openDagDialog((feature as LandPlotFeature).properties)),
        ),
    };
    this.bdsLayer = L.geoJSON(collection as never, options as L.GeoJSONOptions).addTo(map);
    this.updateBdsLabels();
    this.refreshSearchHitOverlay();
  }

  /** Opens the official-style dialog for a clicked BDS dag and lights it up. */
  private openDagDialog(props: LandPlotFeature['properties'] | undefined): void {
    const dag = props?.dag;
    const sheet = props?.sheet;
    if (!dag || !sheet) return;
    this.dagDialog.set({ survey: props?.survey ?? 'bds', sheet, dag: normalizeDagNo(String(dag)) });
    this.styleSearchedLayer();
  }

  /** Closes the dialog, drops the highlight and hands focus back to the map. */
  closeDagDialog(): void {
    if (!this.dagDialog()) return;
    this.dagDialog.set(null);
    this.styleSearchedLayer();
    this.mapContainer().nativeElement.focus({ preventScroll: true });
  }

  /** Permanent dag labels only when zoomed in enough to read them, and only
   * for polygons in view — the full mouza holds thousands of plots and one
   * DOM marker per polygon would freeze the tab. */
  private updateBdsLabels(): void {
    const map = this.map;
    const layer = this.bdsLayer;
    if (!map || !layer) return;
    const show = map.getZoom() >= BDS_LABEL_MIN_ZOOM;
    const view = map.getBounds().pad(0.1);
    layer.eachLayer((child: L.Layer) => {
      const polygon = child as L.Polygon & { __dagLabel?: L.Marker };
      const dag = (polygon.feature as { properties?: { dag?: string } })?.properties?.dag;
      if (!dag) return;
      const visible = show && view.intersects(polygon.getBounds());
      if (visible && !polygon.__dagLabel) {
        const label = L.marker(polygon.getBounds().getCenter(), {
          icon: L.divIcon({ className: 'bds-dag-label', html: String(dag), iconSize: null as never }),
          interactive: false,
          keyboard: false,
        });
        label.addTo(map);
        polygon.__dagLabel = label;
      } else if (!visible && polygon.__dagLabel) {
        map.removeLayer(polygon.__dagLabel);
        polygon.__dagLabel = undefined;
      }
    });
  }

  private removeBdsLayer(): void {
    const map = this.map;
    if (!map || !this.bdsLayer) return;
    this.bdsLayer.eachLayer((child: L.Layer) => {
      const label = (child as L.Polygon & { __dagLabel?: L.Marker }).__dagLabel;
      if (label) map.removeLayer(label);
    });
    map.removeLayer(this.bdsLayer);
    this.bdsLayer = null;
  }

  private loadRsPlots(): void {
    if (!this.map) return;
    const cached = this.rsCollection();
    if (cached) {
      if (this.rsOverlayOn() && !this.rsLayer) this.renderRs(cached);
      return;
    }
    if (this.rsSub && !this.rsSub.closed) return; // already downloading
    this.rsLoading.set(true);
    this.rsSub = this.landDataService
      .masterplanInBbox(this.societyLayerBbox())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (collection) => {
          this.rsLoading.set(false);
          this.rsCollection.set(collection);
          this.externalError.set(false);
          if (this.rsOverlayOn()) this.renderRs(collection);
        },
        error: () => {
          this.rsLoading.set(false);
          this.externalError.set(true);
        },
      });
  }

  private renderRs(collection: LandFeatureCollection): void {
    const map = this.map;
    if (!map) return;
    this.removeRsLayer();
    this.rsRenderer ??= L.canvas({ pane: RS_PANE });
    // `pane`/`renderer` are valid on Leaflet path options but missing from GeoJSONOptions typings.
    const options = {
      pane: RS_PANE,
      renderer: this.rsRenderer,
      style: (feature?: unknown) => this.rsStyle((feature as LandPlotFeature | undefined)?.properties),
      onEachFeature: (feature: unknown, layer: L.Layer) =>
        layer.bindPopup(
          () => this.rsPopupHtml(feature as LandPlotFeature, layer as L.Polygon),
          this.externalPopupOptions(),
        ),
    };
    this.rsLayer = L.geoJSON(collection as never, options as L.GeoJSONOptions).addTo(map);
    void this.loadRsMatch(); // popups show the area once the module is in
    this.updateRsLabels();
    this.refreshSearchHitOverlay();
  }

  private rsStyle(props?: LandPlotFeature['properties']): L.PathOptions {
    const highlight = this.mapMode() === 'boundaries' ? this.highlightDag() : null;
    if (!highlight || this.dagKeyOf(props) !== highlight) return RS_STYLE;
    return {
      ...RS_STYLE,
      color: '#e65100',
      weight: 4,
      dashArray: undefined,
      fillOpacity: 0.5,
      className: 'dag-search-hit',
    };
  }

  /** Reference info only — never an ownership claim. */
  private rsPopupHtml(feature: LandPlotFeature, layer: L.Polygon): string {
    const props = feature.properties ?? {};
    const center = layer.getBounds().getCenter();
    const streetView = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${center.lat},${center.lng}`;
    const t = (key: string) => this.translate.instant(`member.plotMap.views.${key}`);
    const area = this.rsMatchModule?.rsArea(feature.geometry) ?? null;
    const areaLine = area
      ? `<p>${t('rsArea')}: ≈ ${this.digits(area.shotangsho.toFixed(2))} ${this.translate.instant('member.plotMap.details.shotangsho')} (${this.digits(Math.round(area.sqm))} m²)</p>`
      : '';
    return `
      <div class="rajuk-popup">
        <strong>${t('rsPlotNo')}: ${this.digits(props.rs_plot_no ?? props.plot_no ?? '')}</strong>
        <p>${t('rsJlNo')}: 245</p>
        <p>${t('mouzaLabel')}</p>
        <p>${t('thanaLabel')}</p>
        ${areaLine}
        <p class="rs-popup-note">${t('rsReferenceOnly')}</p>
        <a href="${streetView}" target="_blank" rel="noopener noreferrer">${t('streetView')}</a>
      </div>`;
  }

  /** Dag numbers on each parcel: nothing below zoom 16, only parcels big
   * enough to read at 16-17, every parcel from 18. Capped to what is in view. */
  private updateRsLabels(): void {
    const map = this.map;
    const layer = this.rsLayer;
    if (!map || !layer) return;
    const zoom = map.getZoom();
    const view = map.getBounds().pad(0.1);
    layer.eachLayer((child: L.Layer) => {
      const polygon = child as L.Polygon & { __rsLabel?: L.Marker };
      const bounds = polygon.getBounds();
      const text = rsLabelNumber((polygon.feature as LandPlotFeature | undefined)?.properties);
      const visible =
        !!text && zoom >= RS_LABEL_MIN_ZOOM && view.intersects(bounds) && this.isParcelLabelable(bounds, zoom);
      if (visible && !polygon.__rsLabel) {
        polygon.__rsLabel = L.marker(bounds.getCenter(), {
          icon: L.divIcon({ className: 'rs-dag-label', html: this.digits(text), iconSize: null as never }),
          interactive: false,
          keyboard: false,
          snapIgnore: true,
        } as L.MarkerOptions).addTo(map);
      } else if (!visible && polygon.__rsLabel) {
        map.removeLayer(polygon.__rsLabel);
        polygon.__rsLabel = undefined;
      }
    });
  }

  private isParcelLabelable(bounds: L.LatLngBounds, zoom: number): boolean {
    if (zoom >= RS_LABEL_ALL_ZOOM || !this.map) return true;
    const sw = this.map.latLngToContainerPoint(bounds.getSouthWest());
    const ne = this.map.latLngToContainerPoint(bounds.getNorthEast());
    return Math.min(Math.abs(ne.x - sw.x), Math.abs(ne.y - sw.y)) >= RS_LABEL_MIN_PX;
  }

  private removeRsLayer(): void {
    const map = this.map;
    if (!map || !this.rsLayer) return;
    this.rsLayer.eachLayer((child: L.Layer) => {
      const label = (child as L.Polygon & { __rsLabel?: L.Marker }).__rsLabel;
      if (label) map.removeLayer(label);
    });
    map.removeLayer(this.rsLayer);
    this.rsLayer = null;
  }

  // ---- Dag-number search (BDS dag / RS dag) ---------------------------------

  private dagKeyOf(props: LandPlotFeature['properties'] | undefined): string {
    if (!props) return '';
    const value = props.dag ?? props.rs_plot_no ?? props.plot_no;
    return value === undefined || value === null ? '' : normalizeDagNo(String(value));
  }

  /** BDS layer style that keeps the searched dag highlighted across bbox reloads. */
  private bdsStyle(props?: LandPlotFeature['properties']): L.PathOptions {
    const base: L.PathOptions = { color: '#1a3fd4', weight: 2, fillColor: '#2b50e0', fillOpacity: 0.2 };
    const dialogDag = this.dagDialog()?.dag;
    if (dialogDag && this.dagKeyOf(props) === dialogDag) {
      return { ...base, color: '#d32f2f', weight: 3, fillColor: '#d32f2f', fillOpacity: 0.4 };
    }
    const highlight = this.highlightDag();
    if (!highlight || this.dagKeyOf(props) !== highlight) return base;
    return { ...base, color: '#e65100', weight: 4, fillOpacity: 0.5, className: 'dag-search-hit' };
  }

  /** Restyles the already-rendered layer so a hit lights up immediately. */
  private styleSearchedLayer(): void {
    const isBds = this.mapMode() === 'bds';
    const layer = isBds ? this.bdsLayer : this.rsLayer;
    layer?.eachLayer((child: L.Layer) => {
      const polygon = child as L.Polygon;
      const props = polygon.feature?.properties;
      polygon.setStyle(isBds ? this.bdsStyle(props) : this.rsStyle(props));
    });
    this.refreshSearchHitOverlay();
  }

  /** Canvas paths cannot carry the pulsing CSS class, so the searched dag is
   * redrawn as a small non-interactive SVG copy on top of its layer. */
  private refreshSearchHitOverlay(): void {
    const map = this.map;
    this.searchHitLayer?.remove();
    this.searchHitLayer = null;
    const highlight = this.highlightDag();
    if (!map || !highlight) return;
    const isBds = this.mapMode() === 'bds';
    const source = isBds ? this.bdsCollection : this.rsCollection();
    const hits = (source?.features ?? []).filter((f) => this.dagKeyOf(f.properties) === highlight);
    if (!hits.length) return;
    const options = {
      interactive: false,
      snapIgnore: true,
      style: () => SEARCH_HIT_STYLE,
      ...(isBds ? {} : { pane: RS_PANE }),
    };
    this.searchHitLayer = L.geoJSON(
      { type: 'FeatureCollection', features: hits } as never,
      options as L.GeoJSONOptions,
    ).addTo(map);
  }

  onDagQueryInput(value: string): void {
    this.dagQuery.set(value);
    if (!value.trim()) this.clearDagSearch();
  }

  clearDagSearch(): void {
    this.dagQuery.set('');
    this.dagNotFound.set(false);
    this.highlightDag.set(null);
    this.styleSearchedLayer();
  }

  /** BDS mode searches the BDS dag layer; the default view searches the RS dag layer. */
  searchDag(event?: Event): void {
    event?.preventDefault();
    const isBds = this.mapMode() === 'bds';
    const query = toAsciiDigits((isBds ? this.dagQuery() : this.search()).trim());
    if (!query) return;
    this.dagNotFound.set(false);
    this.externalError.set(false);
    this.externalLoading.set(true);
    const request$ = isBds
      ? this.landDataService.lookupDag('bds', query)
      : this.landDataService.lookupRsPlot(query);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (collection) => {
        this.externalLoading.set(false);
        const features = collection.features ?? [];
        if (!features.length) {
          this.highlightDag.set(null);
          this.styleSearchedLayer();
          // A member-plot hit in the default view still counts as found.
          this.dagNotFound.set(isBds || this.featureLayers.size === 0);
          return;
        }
        if (!isBds && !this.rsOverlayOn()) this.setRsOverlay(true);
        this.highlightDag.set(this.dagKeyOf(features[0].properties));
        this.styleSearchedLayer();
        this.fitToFeatures(features);
      },
      error: () => {
        this.externalLoading.set(false);
        this.externalError.set(true);
      },
    });
  }

  /** Flies to the looked-up plots (already in memory: the whole layer is loaded). */
  private fitToFeatures(features: LandPlotFeature[]): void {
    const map = this.map;
    if (!map) return;
    const points: L.LatLngTuple[] = [];
    for (const feature of features) {
      const ringsOfPairs = feature.geometry?.coordinates ?? [];
      // Polygon (rings of pairs) vs MultiPolygon (polygons of rings).
      const polygons = Array.isArray(ringsOfPairs[0]?.[0]?.[0])
        ? (ringsOfPairs as number[][][][])
        : (ringsOfPairs as number[][][]).map((rings) => [rings]);
      for (const rings of polygons) {
        for (const ring of rings) {
          for (const pair of ring) points.push([pair[1], pair[0]]);
        }
      }
    }
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 18 });
  }

  private featureLayerVisible(feature: PlotFeature): boolean {
    const query = toAsciiDigits(this.search().trim()).toLowerCase();
    if (!query) return true;
    const dags = [feature.rsDag, feature.csDag]
      .filter((d): d is string => !!d)
      .map((d) => toAsciiDigits(d).toLowerCase());
    return dags.some((d) => d.includes(query));
  }

  private featureColor(feature: PlotFeature): string {
    if (feature.isMine && feature.reviewStatus === 'approved') return MINE_COLOR;
    return STATUS_COLORS[feature.reviewStatus] ?? STATUS_COLORS['approved'];
  }

  private geoRingToLatLngs(geometry: PolygonGeometry): L.LatLngTuple[] {
    return geometry.coordinates[0].map(
      (pair) => [pair[1], pair[0]] as L.LatLngTuple,
    );
  }

  // ---- Details sheet ------------------------------------------------------

  onFeatureClick(feature: PlotFeature, latlng?: L.LatLng): void {
    if (latlng) {
      this.anchorLatLng = latlng;
      this.updateSheetPos();
    }
    this.selected.set({ feature, owner: null, loading: true, errorKey: null, reported: false });
    this.plotMapService
      .getOwner(feature.boundaryId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (owner) =>
          this.selected.update((sel) =>
            sel && sel.feature.boundaryId === feature.boundaryId
              ? { ...sel, owner, loading: false }
              : sel,
          ),
        error: (err: unknown) =>
          this.selected.update((sel) =>
            sel && sel.feature.boundaryId === feature.boundaryId
              ? { ...sel, loading: false, errorKey: ownerErrorKey(err) }
              : sel,
          ),
      });
  }

  closeSheet(): void {
    this.selected.set(null);
    this.anchorLatLng = null;
    this.sheetPos.set(null);
  }

  /** Keeps the anchored sheet glued to the clicked point as the map moves. */
  private updateSheetPos(): void {
    if (!this.map || !this.anchorLatLng) return;
    const point = this.map.latLngToContainerPoint(this.anchorLatLng);
    this.sheetPos.set({ x: point.x + 12, y: point.y + 12 });
  }

  openReport(): void {
    this.reportOpen.set(true);
    this.reportNote.set('');
    this.reportErrorKey.set(null);
    this.reportSent.set(false);
  }

  sendReport(): void {
    const selected = this.selected();
    if (!selected || !this.reportNote().trim()) return;
    this.reportSending.set(true);
    this.reportErrorKey.set(null);
    this.plotMapService
      .report(selected.feature.boundaryId, this.reportNote().trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.reportSending.set(false);
          this.reportSent.set(true);
          this.selected.update((sel) => (sel ? { ...sel, reported: true } : sel));
        },
        error: () => {
          this.reportSending.set(false);
          this.reportErrorKey.set('member.plotMap.report.error');
        },
      });
  }

  // ---- Search / locate ----------------------------------------------------

  onSearchInput(value: string): void {
    this.search.set(value);
    this.renderFeatures();
    const query = toAsciiDigits(value.trim()).toLowerCase();
    if (!query) return;
    const match = this.features().find((f) =>
      [f.rsDag, f.csDag]
        .filter((d): d is string => !!d)
        .some((d) => toAsciiDigits(d).toLowerCase() === query),
    );
    if (match) this.highlightFeature(match);
  }

  private highlightFeature(feature: PlotFeature): void {
    const layer = this.featureLayers.get(`${feature.boundaryId}:${feature.reviewStatus}`);
    if (!layer || !this.map) return;
    this.map.fitBounds(layer.getBounds().pad(0.5));
    layer.setStyle({ weight: 5, fillOpacity: 0.5 });
    setTimeout(() => layer.setStyle({ weight: 2, fillOpacity: 0.25 }), 2500);
  }

  private myLocationMarker: L.Marker | null = null;

  locateMe(): void {
    if (!navigator.geolocation) {
      this.myLocationError.set(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        this.zone.run(() => {
          this.myLocationError.set(false);
          if (!this.map) return;
          const { latitude, longitude } = position.coords;
          if (this.insideSociety(latitude, longitude)) {
            this.outsideSociety.set(false);
            this.map.setView([latitude, longitude], 17);
            const icon = L.divIcon({
              className: 'my-location-dot',
              html: '<span class="my-location-dot-inner"></span>',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            });
            if (this.myLocationMarker) {
              this.myLocationMarker.setLatLng([latitude, longitude]);
            } else {
              this.myLocationMarker = L.marker([latitude, longitude], { icon }).addTo(this.map);
            }
          } else {
            // Member is away from the society — show the society instead.
            this.outsideSociety.set(true);
            this.map.fitBounds(this.societyBounds());
          }
        }),
      () => this.zone.run(() => this.myLocationError.set(true)),
    );
  }

  // ---- Disclaimer ---------------------------------------------------------

  dismissDisclaimer(): void {
    this.disclaimerDismissed.set(true);
    try {
      sessionStorage.setItem(DISCLAIMER_KEY, '1');
    } catch {
      // private mode - banner just returns next reload
    }
  }

  private readDisclaimerDismissed(): boolean {
    try {
      return sessionStorage.getItem(DISCLAIMER_KEY) === '1';
    } catch {
      return false;
    }
  }

  // ---- Draw flow ----------------------------------------------------------

  openDrawPanel(): void {
    this.showDrawPanel.set(true);
    if (this.drawStep() === 'idle') this.drawStep.set('pick');
    this.plotMapService
      .listMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (mine) => this.myBoundaries.set(mine) });
  }

  closeDrawPanel(): void {
    this.cancelDraw();
    this.showDrawPanel.set(false);
  }

  async startDrawing(): Promise<void> {
    if (!this.selectedPropertyId() || !this.map) return;
    this.editingBoundary.set(null);
    await this.enableFreehand();
  }

  /** Starts the Geoman polygon tool (free drawing); waits for Geoman first. */
  private async enableFreehand(): Promise<void> {
    if (!this.map) return;
    await this.ensureGeoman();
    this.discardShape();
    this.drawStep.set('draw');
    this.saveErrorKey.set(null);
    this.drawnGeometry.set(null);
    this.freehand.set(true);
    this.freehandVertices.set(0);
    this.loadRsPlots(); // the match summary needs RS parcels even if the overlay is hidden
    this.applyDrawingMode();
    this.map.pm.enableDraw('Polygon', {
      ...this.snapOptions(),
      allowSelfIntersection: false,
      // touch-friendly defaults (geoman enables them with touch support on).
      templineStyle: { color: MINE_COLOR, weight: 3 },
      hintlineStyle: { color: MINE_COLOR, dashArray: '6,6' },
    } as never);
  }

  async startEditing(boundary: MyBoundary): Promise<void> {
    if (!this.map) return;
    await this.ensureGeoman();
    this.editingBoundary.set(boundary);
    this.drawStep.set('draw');
    if (this.wizardOn()) this.wizardStep.set('adjust');
    this.saveErrorKey.set(null);
    this.drawnGeometry.set(boundary.geometry);
    this.showDrawPanel.set(true);
    this.placeEditableShape(this.geoRingToLatLngs(boundary.geometry));
  }

  /** Puts an editable polygon on the map and starts its history. */
  private placeEditableShape(ring: L.LatLngTuple[]): void {
    const map = this.map;
    if (!map) return;
    const layer = L.polygon(ring, { color: MINE_COLOR }).addTo(map);
    this.drawnLayer = layer;
    this.loadRsPlots();
    layer.pm.enable(this.editOptions());
    this.applyDrawingMode();
    this.attachEditListeners(layer);
    this.syncDrawnGeometry();
    this.recordSnapshot();
  }

  private editOptions(): never {
    return { ...this.snapOptions(), allowSelfIntersection: false, allowRemoval: false } as never;
  }

  private attachEditListeners(layer: L.Polygon): void {
    const onChange = (): void =>
      this.zone.run(() => {
        this.syncDrawnGeometry();
        this.recordSnapshot();
      });
    layer.on('pm:edit', onChange);
    layer.on('pm:vertexadded', onChange);
    layer.on('pm:vertexremoved', onChange);
  }

  private layerRing(): Array<[number, number]> | null {
    const latlngs = this.drawnLayer?.getLatLngs()[0] as L.LatLng[] | undefined;
    return latlngs ? latlngs.map((ll) => [ll.lat, ll.lng] as [number, number]) : null;
  }

  private syncDrawnGeometry(): void {
    const ring = this.layerRing();
    if (ring) this.drawnGeometry.set(latLngsToGeometry(ring));
  }

  private recordSnapshot(): void {
    const ring = this.layerRing();
    if (ring) this.history.update((h) => pushRing(h, ring));
  }

  // ---- map_wizard: undo / redo -------------------------------------------

  undoEdit(): void {
    if (this.freehand()) {
      const draw = (this.map?.pm.Draw as unknown as Record<string, { _removeLastVertex?: () => void }> | undefined)?.['Polygon'];
      draw?._removeLastVertex?.();
      this.freehandVertices.update((n) => Math.max(0, n - 1));
      return;
    }
    this.moveHistory(undoHistory(this.history()));
  }

  redoEdit(): void {
    if (!this.freehand()) this.moveHistory(redoHistory(this.history()));
  }

  /** Re-applies a snapshot; editing is re-enabled or the vertex handles would disappear. */
  private moveHistory(next: EditHistory): void {
    const ring = currentRing(next);
    const layer = this.drawnLayer;
    if (next === this.history() || !ring || !layer) return;
    this.history.set(next);
    layer.setLatLngs(ring.map(([lat, lng]) => [lat, lng] as L.LatLngTuple));
    layer.pm.disable();
    layer.pm.enable(this.editOptions());
    this.syncDrawnGeometry();
  }

  /** Removes the drawn shape (or the tool in progress) and its history. */
  private discardShape(): void {
    const pm = this.map?.pm as unknown as { disableDraw?: () => void } | undefined;
    pm?.disableDraw?.();
    this.drawnLayer?.pm?.disable?.();
    this.drawnLayer?.remove();
    this.drawnLayer = null;
    this.drawnGeometry.set(null);
    this.history.set(emptyHistory());
    this.freehand.set(false);
    this.freehandVertices.set(0);
  }

  // ---- map_wizard: the three steps ----------------------------------------

  /** Step 1: a property was picked; look its RS dag up (or go straight to drawing without any dag). */
  async pickWizardProperty(property: MemberProperty): Promise<void> {
    this.selectedPropertyId.set(property.id);
    this.rsCandidates.set([]);
    this.rsCandidateIndex.set(0);
    this.chosenRs.set(null);
    this.rsLookup.set('idle');
    if (!property.dagNoRs && !property.dagNoCs) {
      await this.chooseDrawMyself();
      return;
    }
    if (property.dagNoRs) this.lookupRsCandidates(property.dagNoRs);
    else this.rsLookup.set('none');
  }

  searchOtherDag(): void {
    const query = toAsciiDigits(this.otherDagQuery().trim());
    if (query) this.lookupRsCandidates(query);
  }

  private lookupRsCandidates(query: string): void {
    this.rsLookup.set('loading');
    this.landDataService
      .lookupRsPlot(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (collection) => {
          const features = collection.features ?? [];
          this.rsCandidates.set(features);
          this.rsCandidateIndex.set(0);
          this.rsLookup.set(features.length ? 'found' : 'none');
          if (!features.length) return;
          if (!this.rsOverlayOn()) this.setRsOverlay(true);
          this.highlightDag.set(this.dagKeyOf(features[0].properties));
          this.styleSearchedLayer();
          this.fitToFeatures(features);
        },
        error: () => this.rsLookup.set('error'),
      });
  }

  candidateLabel(feature: LandPlotFeature): { dag: string; sheet: string } {
    return { dag: this.digits(rsLabelNumber(feature.properties)), sheet: this.digits(feature.properties?.sheet ?? '') };
  }

  async confirmRsCandidate(): Promise<void> {
    const chosen = this.rsCandidates()[this.rsCandidateIndex()];
    if (!chosen) return;
    this.chosenRs.set(chosen);
    this.wizardStep.set('adjust');
    await this.startFromDag();
  }

  async chooseDrawMyself(): Promise<void> {
    this.chosenRs.set(null);
    this.wizardStep.set('adjust');
    await this.startFreehand();
  }

  /** Step 2 default: the chosen RS plot becomes an editable shape with snapping on. */
  async startFromDag(): Promise<void> {
    const ring = outerRingLatLngs(this.chosenRs()?.geometry);
    if (!ring || !this.map) return;
    await this.ensureGeoman();
    this.discardShape();
    this.editingBoundary.set(null);
    this.drawStep.set('draw');
    this.saveErrorKey.set(null);
    this.snapEnabled.set(true);
    this.persistLayerPrefs();
    if (!this.rsOverlayOn()) this.setRsOverlay(true);
    this.drawnGeometry.set(latLngsToGeometry(ring));
    this.placeEditableShape(ring);
  }

  async startFreehand(): Promise<void> {
    this.editingBoundary.set(null);
    await this.enableFreehand();
  }

  /** "সব মুছে নতুন করে": back to an empty step 2. */
  clearAll(): void {
    this.discardShape();
    this.saveErrorKey.set(null);
  }

  goToSubmitStep(): void {
    if (this.validation().valid) this.wizardStep.set('submit');
  }

  backToAdjustStep(): void {
    this.wizardStep.set('adjust');
  }

  private resetWizard(): void {
    this.wizardStep.set('find');
    this.rsLookup.set('idle');
    this.rsCandidates.set([]);
    this.rsCandidateIndex.set(0);
    this.chosenRs.set(null);
    this.otherDagQuery.set('');
    this.history.set(emptyHistory());
    this.freehand.set(false);
    this.freehandVertices.set(0);
  }

  dagLabelFor(property: MemberProperty | null): string {
    return property ? this.digits([property.dagNoRs, property.dagNoCs].filter(Boolean).join(' / ')) : '—';
  }

  cancelDraw(): void {
    const pm = this.map?.pm as unknown as { disable?: () => void } | undefined;
    pm?.disable?.();
    this.drawnLayer?.remove();
    this.drawnLayer = null;
    this.drawnGeometry.set(null);
    this.drawStep.set(this.showDrawPanel() ? 'pick' : 'idle');
    this.selectedPropertyId.set(null);
    this.saveErrorKey.set(null);
    this.clearSnapCue();
    this.resetWizard();
    this.applyDrawingMode();
  }

  private declaredQuantity(): string | null {
    const propertyId = this.editingBoundary()?.propertyId ?? this.selectedPropertyId();
    return this.properties().find((p) => p.id === propertyId)?.landQuantity ?? null;
  }

  /** Save is gated by a confirm when it replaces an already-pending review. */
  requestSave(): void {
    const editing = this.editingBoundary();
    if (editing?.hasPending) {
      this.replaceTarget.set(editing);
      return;
    }
    this.saveDrawn();
  }

  saveDrawn(): void {
    if (!this.validation().valid || this.saving()) return;
    const geometry = this.drawnGeometry();
    if (!geometry) return;
    this.saving.set(true);
    this.saveErrorKey.set(null);
    this.replaceTarget.set(null);
    const editing = this.editingBoundary();
    const request$ = editing
      ? this.plotMapService.update(editing.id, geometry)
      : this.plotMapService.create(this.selectedPropertyId()!, geometry);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelDraw();
        this.closeDrawPanel();
        this.loadFeatures();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveErrorKey.set(saveErrorKey(err));
      },
    });
  }

  /** Members cannot delete; they can only withdraw a pending submission. */
  confirmWithdraw(): void {
    const target = this.withdrawTarget();
    if (!target || this.withdrawing()) return;
    this.withdrawing.set(true);
    this.plotMapService
      .withdraw(target.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.withdrawing.set(false);
          this.withdrawTarget.set(null);
          this.loadFeatures();
          this.plotMapService
            .listMine()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: (mine) => this.myBoundaries.set(mine) });
        },
        error: () => {
          this.withdrawing.set(false);
          this.withdrawTarget.set(null);
        },
      });
  }

  cancelWithdraw(): void {
    if (!this.withdrawing()) this.withdrawTarget.set(null);
  }

  // ---- Template helpers ---------------------------------------------------

  digits(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    return localizeDigits(toAsciiDigits(String(value)), this.lang());
  }

  disclaimerText(): string {
    const d = this.disclaimer();
    return d ? (this.lang() === 'bn' ? d.bn : d.en) : '';
  }

  ownerContactLinks(owner: BoundaryOwner): { tel: string | null; wa: string | null } {
    return { tel: telHref(owner.mobile), wa: whatsAppHref(owner.mobile) };
  }

  propertyLabel(property: MemberProperty): string {
    const dags = [property.dagNoRs, property.dagNoCs].filter(Boolean).join(' / ');
    return dags ? `দাগ ${dags}` : `#${property.id}`;
  }

  boundaryLabel(boundary: MyBoundary): string {
    const dags = [boundary.rsDag, boundary.csDag].filter(Boolean).join(' / ');
    return dags ? `দাগ ${dags}` : `#${boundary.propertyId}`;
  }
}
