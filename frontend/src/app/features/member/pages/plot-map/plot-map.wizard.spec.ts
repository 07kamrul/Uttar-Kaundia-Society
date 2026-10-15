import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bn from '../../../../../../public/i18n/bn.json';
import { AuthService } from '../../../../core/services/auth.service';
import { FeatureFlagService, type FeatureFlagKey } from '../../../../core/services/feature-flag.service';
import { LanguageService } from '../../../../core/services/language.service';
import { LandDataService, type LandFeatureCollection } from '../../../../core/services/land-data.service';
import { MemberService } from '../../../../core/services/member.service';
import { PlotMapService } from '../../../../core/services/plot-map.service';
import { toPlotMapPage } from '../../../../core/models/plot-boundary.model';
import { PlotMapComponent } from './plot-map.component';

function memoryStorage(): Storage {
  const backing = new Map<string, string>();
  return {
    get length(): number {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    removeItem: (key: string) => void backing.delete(key),
    setItem: (key: string, value: string) => void backing.set(key, value),
  };
}

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

interface PolygonStub {
  handlers: Record<string, () => void>;
  ring: [number, number][];
  setLatLngs: ReturnType<typeof vi.fn>;
  pm: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn>; setOptions: ReturnType<typeof vi.fn> };
  [key: string]: unknown;
}

const hoisted = vi.hoisted(() => {
  const polygons: Array<Record<string, unknown>> = [];
  const layerStub = () => ({
    addTo: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    setStyle: vi.fn(),
    eachLayer: vi.fn(),
    getBounds: vi.fn(() => ({ pad: vi.fn(() => ({})) })),
    getLatLngs: vi.fn(() => []),
    pm: { enable: vi.fn(), disable: vi.fn(), setOptions: vi.fn() },
  });
  const makePolygon = (latlngs: [number, number][]) => {
    const handlers: Record<string, () => void> = {};
    const stub: Record<string, unknown> = {
      ...layerStub(),
      handlers,
      ring: latlngs,
    };
    stub['on'] = vi.fn((name: string, fn: () => void) => {
      handlers[name] = fn;
      return stub;
    });
    stub['getLatLngs'] = vi.fn(() => [(stub['ring'] as [number, number][]).map(([lat, lng]) => ({ lat, lng }))]);
    stub['setLatLngs'] = vi.fn((next: [number, number][]) => {
      stub['ring'] = next.map((p) => [p[0], p[1]]);
      return stub;
    });
    polygons.push(stub);
    return stub;
  };
  const maps: Array<Record<string, unknown>> = [];
  const makeMapStub = () => {
    const stub = {
      on: vi.fn(),
      off: vi.fn(),
      setView: vi.fn(),
      fitBounds: vi.fn(),
      invalidateSize: vi.fn(),
      removeLayer: vi.fn(),
      addLayer: vi.fn(),
      remove: vi.fn(),
      getZoom: vi.fn(() => 15),
      getBounds: vi.fn(() => {
        const bounds = {
          toBBoxString: () => '90.30,23.70,90.50,23.80',
          pad: () => bounds,
          contains: () => true,
          intersects: () => false,
        };
        return bounds;
      }),
      createPane: vi.fn(() => ({ style: {} })),
      pm: {
        enableDraw: vi.fn(),
        disable: vi.fn(),
        disableDraw: vi.fn(),
        setGlobalOptions: vi.fn(),
        Draw: { Polygon: { setOptions: vi.fn(), _removeLastVertex: vi.fn() } },
      },
    };
    maps.push(stub);
    return stub;
  };
  const tileLayers: Array<Record<string, unknown>> = [];
  const stub = {
    map: vi.fn(() => makeMapStub()),
    tileLayer: vi.fn(() => {
      const layer = layerStub();
      tileLayers.push(layer);
      return layer;
    }),
    polygon: vi.fn((latlngs: [number, number][]) => makePolygon(latlngs)),
    rectangle: vi.fn(() => layerStub()),
    geoJSON: vi.fn(() => layerStub()),
    canvas: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({
      pad: vi.fn(() => ({ getCenter: vi.fn(() => ({ lat: 23.809, lng: 90.323 })) })),
    })),
    control: {
      layers: vi.fn(() => ({ addTo: vi.fn() })),
      zoom: vi.fn(() => ({ addTo: vi.fn() })),
    },
  };
  return { stub, polygons, maps, tileLayers };
});

vi.mock('leaflet', () => hoisted.stub);
vi.mock('@geoman-io/leaflet-geoman-free', () => ({}));

const L = hoisted.stub;

const TINY_RING: number[][] = [
  [90.32, 23.8],
  [90.3201, 23.8],
  [90.3201, 23.8001],
  [90.32, 23.8001],
  [90.32, 23.8],
];

function rsCollection(): LandFeatureCollection {
  return {
    type: 'FeatureCollection',
    count: 1,
    features: [
      {
        type: 'Feature',
        properties: { rs_plot_no: 'RS-830', plot_no: 830, sheet: 'S-1' },
        geometry: { type: 'Polygon', coordinates: [TINY_RING] },
      },
    ],
  };
}

const EMPTY: LandFeatureCollection = { type: 'FeatureCollection', count: 0, features: [] };

interface Options {
  flags?: FeatureFlagKey[];
  lookup?: LandFeatureCollection;
  permissions?: string[];
  properties?: Array<Record<string, unknown>>;
}

function setup(options: Options = {}) {
  const flags = new Set<FeatureFlagKey>(options.flags ?? []);
  const plotMapService = {
    listFeatures: vi.fn(() =>
      of(
        toPlotMapPage({
          disclaimer_en: 'Disclaimer EN',
          disclaimer_bn: 'সার্ভারের বিস্তারিত নোটিশ',
          count: 0,
          features: [],
        }),
      ),
    ),
    getOwner: vi.fn(),
    listMine: vi.fn(() => of([])),
    create: vi.fn(() => of({})),
    update: vi.fn(() => of({})),
    withdraw: vi.fn(() => of({})),
    report: vi.fn(),
  };
  const landData = {
    dagsInBbox: vi.fn(() => of(EMPTY)),
    masterplanInBbox: vi.fn(() => of(EMPTY)),
    lookupDag: vi.fn(() => of(EMPTY)),
    lookupRsPlot: vi.fn(() => of(options.lookup ?? EMPTY)),
  };
  const properties = options.properties ?? [
    { id: 3, dagNoRs: '830', dagNoCs: '412', landQuantity: '5' },
    { id: 9, dagNoRs: undefined, dagNoCs: undefined, landQuantity: null },
  ];
  TestBed.configureTestingModule({
    imports: [PlotMapComponent],
    providers: [
      provideTranslateService(),
      { provide: PlotMapService, useValue: plotMapService },
      { provide: MemberService, useValue: { getProfile: vi.fn(() => of({ properties })) } },
      { provide: LandDataService, useValue: landData },
      { provide: LanguageService, useValue: { lang: vi.fn(() => 'bn'), setLang: vi.fn() } },
      { provide: FeatureFlagService, useValue: { isEnabled: (k: FeatureFlagKey) => flags.has(k) } },
      {
        provide: AuthService,
        useValue: { hasPermission: (key: string) => (options.permissions ?? ['boundary.view', 'boundary.draw_own']).includes(key) },
      },
    ],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('bn', bn);
  t.use('bn');
  const fixture = TestBed.createComponent(PlotMapComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, plotMapService, landData };
}

type Fx = ComponentFixture<PlotMapComponent>;
const q = (f: Fx, sel: string) => (f.nativeElement as HTMLElement).querySelector(sel) as HTMLElement | null;
const qa = (f: Fx, sel: string) => [...(f.nativeElement as HTMLElement).querySelectorAll(sel)] as HTMLElement[];
const tid = (f: Fx, id: string) => q(f, `[data-testid="${id}"]`);

async function flush(f: Fx): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  f.detectChanges();
}

async function click(f: Fx, id: string): Promise<void> {
  const el = tid(f, id);
  if (!el) throw new Error(`missing ${id}`);
  el.click();
  await flush(f);
}

const text = (f: Fx) => (f.nativeElement as HTMLElement).textContent ?? '';

beforeEach(() => {
  hoisted.polygons.length = 0;
  hoisted.maps.length = 0;
  hoisted.tileLayers.length = 0;
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memoryStorage() });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
});
afterEach(() => TestBed.resetTestingModule());

describe('PlotMapComponent with map_wizard off (unchanged)', () => {
  it('adds the street tiles on init and shows today\'s mode tabs and 5-item legend', () => {
    const { fixture } = setup();
    expect(L.tileLayer).toHaveBeenCalled();
    expect(L.control.layers).toHaveBeenCalled();
    expect(qa(fixture, '.map-mode-tab').length).toBeGreaterThanOrEqual(2);
    expect(qa(fixture, '.legend-chip').length).toBe(6);
    expect(tid(fixture, 'tile-gate')).toBeNull();
    expect(tid(fixture, 'layers-open')).toBeNull();
    expect(tid(fixture, 'wizard-header')).toBeNull();
    expect(tid(fixture, 'map-tour')).toBeNull();
    expect(L.rectangle).not.toHaveBeenCalled();
  });

  it('shows the server disclaimer banner, not the short notice', () => {
    const { fixture } = setup();
    expect(q(fixture, '.disclaimer-banner')?.textContent).toContain('সার্ভারের বিস্তারিত নোটিশ');
    expect(tid(fixture, 'notice-more')).toBeNull();
  });

  it('keeps the old draw panel without step header', async () => {
    const { fixture, component } = setup();
    component.openDrawPanel();
    fixture.detectChanges();
    expect(q(fixture, '.draw-panel')).not.toBeNull();
    expect(tid(fixture, 'wizard-header')).toBeNull();
  });
});

describe('PlotMapComponent with map_wizard on: tiles and layers', () => {
  it('adds no tile layer until "মানচিত্র দেখুন" is tapped, then remembers it for the session', async () => {
    const { fixture } = setup({ flags: ['map_wizard'] });
    expect(L.tileLayer).toHaveBeenCalled(); // layer objects are created, but not added
    const street = hoisted.tileLayers[0];
    expect((street['addTo'] as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect(L.control.layers).not.toHaveBeenCalled();
    const card = tid(fixture, 'tile-gate')!;
    expect(card.textContent).toContain('মানচিত্র দেখুন');
    expect(card.textContent).toContain('ইন্টারনেট ডেটা খরচ হবে');
    await click(fixture, 'tile-gate');
    expect((street['addTo'] as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(sessionStorage.getItem('krmf_map_tiles_ok')).toBe('1');
    expect(tid(fixture, 'tile-gate')).toBeNull();
  });

  it('shows the society outline on the plain background', () => {
    setup({ flags: ['map_wizard'] });
    expect(L.rectangle).toHaveBeenCalled();
  });

  it('adds the tiles straight away when the session already said yes', () => {
    sessionStorage.setItem('krmf_map_tiles_ok', '1');
    const { fixture } = setup({ flags: ['map_wizard'] });
    const street = hoisted.tileLayers[0];
    expect((street['addTo'] as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(tid(fixture, 'tile-gate')).toBeNull();
  });

  it('replaces mode tabs with one "আরও লেয়ার" button that opens the layers sheet', async () => {
    const { fixture, component, landData } = setup({ flags: ['map_wizard'] });
    expect(qa(fixture, '.map-mode-tab').length).toBe(0);
    expect(tid(fixture, 'layers-open')?.textContent).toContain('আরও লেয়ার');
    expect(tid(fixture, 'layers-sheet')).toBeNull();
    await click(fixture, 'layers-open');
    expect(tid(fixture, 'layers-sheet')).not.toBeNull();
    await click(fixture, 'layer-mode-bds');
    expect(component.mapMode()).toBe('bds');
    expect(landData.dagsInBbox).toHaveBeenCalled();
    await click(fixture, 'layer-mode-mine');
    expect(component.mapMode()).toBe('boundaries');
  });

  it('the layers sheet toggles RS lines, snapping and satellite', async () => {
    const { fixture, component } = setup({ flags: ['map_wizard'] });
    await click(fixture, 'layers-open');
    const before = component.rsOverlayOn();
    await click(fixture, 'layer-rs');
    expect(component.rsOverlayOn()).toBe(!before);
    await click(fixture, 'layer-satellite');
    expect(component.satelliteOn()).toBe(true);
  });

  it('draws a three-colour legend with words', () => {
    const { fixture } = setup({ flags: ['map_wizard'] });
    const chips = qa(fixture, '.legend-chip');
    expect(chips.length).toBe(3);
    const t = text(fixture);
    expect(t).toContain('অনুমোদিত');
    expect(t).toContain('আমার');
    expect(t).toContain('অপেক্ষায়');
  });

  it('does not fetch the RS layer on load unless the member switched it on before', () => {
    const { landData } = setup({ flags: ['map_wizard'] });
    expect(landData.masterplanInBbox).not.toHaveBeenCalled();
  });
});

describe('PlotMapComponent with map_wizard on: notice and tour', () => {
  it('shows the short notice and expands to the unchanged server text', async () => {
    const { fixture } = setup({ flags: ['map_wizard'] });
    expect(q(fixture, '.disclaimer-banner')).toBeNull();
    const short = tid(fixture, 'notice-short')!;
    expect(short.textContent).toContain('এটি আনুমানিক সীমানা — সরকারি জরিপ বা দলিলের বিকল্প নয়।');
    expect(tid(fixture, 'notice-text')).toBeNull();
    await click(fixture, 'notice-more');
    expect(tid(fixture, 'notice-text')?.textContent).toContain('সার্ভারের বিস্তারিত নোটিশ');
  });

  it('shows the tour once: four marks, then never again', async () => {
    const first = setup({ flags: ['map_wizard'] });
    expect(tid(first.fixture, 'map-tour')).not.toBeNull();
    for (let i = 0; i < 3; i++) await click(first.fixture, 'tour-next');
    expect(tid(first.fixture, 'map-tour')?.textContent).toContain('৪ / ৪');
    await click(first.fixture, 'tour-next');
    expect(tid(first.fixture, 'map-tour')).toBeNull();
    expect(localStorage.getItem('krmf_map_tour_v1')).toBe('1');
    TestBed.resetTestingModule();

    const second = setup({ flags: ['map_wizard'] });
    expect(tid(second.fixture, 'map-tour')).toBeNull();
    await click(second.fixture, 'help-open');
    await click(second.fixture, 'tour-again');
    expect(tid(second.fixture, 'map-tour')).not.toBeNull();
  });

  it('can be skipped and closes with Escape', async () => {
    const a = setup({ flags: ['map_wizard'] });
    await click(a.fixture, 'tour-skip');
    expect(tid(a.fixture, 'map-tour')).toBeNull();
    expect(localStorage.getItem('krmf_map_tour_v1')).toBe('1');
    TestBed.resetTestingModule();
    localStorage.removeItem('krmf_map_tour_v1');
    const b = setup({ flags: ['map_wizard'] });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush(b.fixture);
    expect(tid(b.fixture, 'map-tour')).toBeNull();
  });
});

describe('PlotMapComponent with map_wizard on: three-step wizard', () => {
  async function openWizard(options: Options = {}) {
    localStorage.setItem('krmf_map_tour_v1', '1');
    const ctx = setup({ flags: ['map_wizard'], ...options });
    ctx.component.openDrawPanel();
    await flush(ctx.fixture);
    return ctx;
  }

  it('starts at step 1 with the numbered header', async () => {
    const { fixture } = await openWizard();
    expect(tid(fixture, 'wizard-header')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('ধাপ ১ / ৩ — দাগ খুঁজুন');
  });

  it('picks a property, looks up its RS dag and lists the candidates', async () => {
    const { fixture, landData } = await openWizard({ lookup: rsCollection() });
    await click(fixture, 'wizard-pick-3');
    expect(landData.lookupRsPlot).toHaveBeenCalledWith('830');
    expect(qa(fixture, '[data-testid="rs-candidate"]').length).toBe(1);
    expect(tid(fixture, 'rs-confirm')?.textContent).toContain('এটাই আমার দাগ');
    expect(tid(fixture, 'rs-other')?.textContent).toContain('অন্য দাগ খুঁজুন');
    expect(tid(fixture, 'rs-none')?.textContent).toContain('দাগ পাওয়া যায়নি — নিজে আঁকুন');
  });

  it('flows pick -> RS lookup -> prefill -> edit -> undo/redo -> submit with the edited ring', async () => {
    const { fixture, component, plotMapService } = await openWizard({ lookup: rsCollection() });
    await click(fixture, 'wizard-pick-3');
    await click(fixture, 'rs-confirm');

    expect(tid(fixture, 'wizard-header')?.textContent?.replace(/\s+/g, ' ')).toContain('ধাপ ২ / ৩');
    const drawn = hoisted.polygons.find((p) => (p['pm'] as PolygonStub['pm']).enable.mock.calls.length > 0) as unknown as PolygonStub;
    expect(drawn).toBeDefined();
    expect(component.drawnGeometry()).not.toBeNull();

    const undoBtn = tid(fixture, 'undo') as HTMLButtonElement;
    const redoBtn = tid(fixture, 'redo') as HTMLButtonElement;
    expect(undoBtn.textContent).toContain('এক ধাপ পেছনে');
    expect(redoBtn.textContent).toContain('আবার করুন');
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);

    const original = drawn.ring.map((p) => [...p]);
    const edited = original.map((p, i) => (i === 1 ? [p[0], p[1] + 0.00002] : [...p]));
    drawn.ring = edited as [number, number][];
    drawn.handlers['pm:edit']();
    await flush(fixture);
    expect((tid(fixture, 'undo') as HTMLButtonElement).disabled).toBe(false);

    await click(fixture, 'undo');
    expect(drawn.setLatLngs).toHaveBeenLastCalledWith(original);
    expect(drawn.pm.enable).toHaveBeenCalledTimes(2); // re-enabled after setLatLngs so the handles come back
    expect((tid(fixture, 'redo') as HTMLButtonElement).disabled).toBe(false);
    expect((tid(fixture, 'undo') as HTMLButtonElement).disabled).toBe(true);

    await click(fixture, 'redo');
    expect(drawn.setLatLngs).toHaveBeenLastCalledWith(edited);

    await click(fixture, 'adjust-next');
    expect(tid(fixture, 'wizard-header')?.textContent?.replace(/\s+/g, ' ')).toContain('ধাপ ৩ / ৩');
    expect(text(fixture)).toContain('এটি আনুমানিক সীমানা');
    await click(fixture, 'submit-go');
    expect(plotMapService.create).toHaveBeenCalledTimes(1);
    const [propertyId, geometry] = plotMapService.create.mock.calls[0] as unknown as [number, { coordinates: number[][][] }];
    expect(propertyId).toBe(3);
    expect(geometry.coordinates[0][1]).toEqual([edited[1][1], edited[1][0]]);
  });

  it('"not found" goes to free drawing with the Geoman draw tool', async () => {
    const { fixture, component } = await openWizard({ lookup: EMPTY });
    const map = hoisted.maps[0] as { pm: { enableDraw: ReturnType<typeof vi.fn> } };
    await click(fixture, 'wizard-pick-3');
    expect(text(fixture)).toContain('এই নম্বরে কোনো দাগ পাওয়া যায়নি।');
    expect(tid(fixture, 'rs-confirm')).toBeNull();
    await click(fixture, 'rs-none');
    expect(component.wizardStep()).toBe('adjust');
    expect(map.pm.enableDraw).toHaveBeenCalledWith('Polygon', expect.anything());
  });

  it('a property without any dag skips straight to free drawing', async () => {
    const { fixture, component, landData } = await openWizard();
    const map = hoisted.maps[0] as { pm: { enableDraw: ReturnType<typeof vi.fn> } };
    await click(fixture, 'wizard-pick-9');
    expect(landData.lookupRsPlot).not.toHaveBeenCalled();
    expect(component.wizardStep()).toBe('adjust');
    expect(map.pm.enableDraw).toHaveBeenCalled();
  });

  it('during freehand drawing undo removes the last vertex and redo stays disabled', async () => {
    const { fixture } = await openWizard({ lookup: EMPTY });
    const map = hoisted.maps[0] as { pm: { Draw: { Polygon: { _removeLastVertex: ReturnType<typeof vi.fn> } } }; on: ReturnType<typeof vi.fn> };
    await click(fixture, 'wizard-pick-3');
    await click(fixture, 'rs-none');
    expect((tid(fixture, 'undo') as HTMLButtonElement).disabled).toBe(true);
    const onVertex = map.on.mock.calls.find((c) => c[0] === 'pm:vertexadded')![1] as () => void;
    onVertex();
    await flush(fixture);
    expect((tid(fixture, 'undo') as HTMLButtonElement).disabled).toBe(false);
    expect((tid(fixture, 'redo') as HTMLButtonElement).disabled).toBe(true);
    await click(fixture, 'undo');
    expect(map.pm.Draw.Polygon._removeLastVertex).toHaveBeenCalledTimes(1);
  });

  it('awaits the Geoman dynamic import before the draw tool starts', async () => {
    const { fixture, component } = await openWizard({ lookup: EMPTY });
    const map = hoisted.maps[0] as { pm: { enableDraw: ReturnType<typeof vi.fn> } };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    (component as unknown as { loadGeomanModule: () => Promise<unknown> }).loadGeomanModule = () => gate;
    await click(fixture, 'wizard-pick-3');
    await click(fixture, 'rs-none');
    expect(map.pm.enableDraw).not.toHaveBeenCalled();
    release();
    await flush(fixture);
    expect(map.pm.enableDraw).toHaveBeenCalled();
  });

  it('"সব মুছে নতুন করে" clears the shape and the history', async () => {
    const { fixture, component } = await openWizard({ lookup: rsCollection() });
    await click(fixture, 'wizard-pick-3');
    await click(fixture, 'rs-confirm');
    expect(component.drawnGeometry()).not.toBeNull();
    await click(fixture, 'clear-all');
    expect(component.drawnGeometry()).toBeNull();
    expect((tid(fixture, 'undo') as HTMLButtonElement).disabled).toBe(true);
  });
});
