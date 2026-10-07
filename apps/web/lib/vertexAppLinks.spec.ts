import { describe, expect, it } from 'vitest';
import { APP_PATHS, appleAppSiteAssociation, assetLinks } from './vertexAppLinks';

describe('links the Vertex app opens', () => {
  it('serves nothing until the app is set up', () => {
    expect(appleAppSiteAssociation({})).toBeNull();
    expect(assetLinks({ ANDROID_PACKAGE: 'dev.vertex.connect' })).toBeNull();
  });

  it("claims the signed-in pages for iOS, and offers the website's saved passwords", () => {
    const aasa = appleAppSiteAssociation({ APPLE_APP_IDS: 'ABCDE12345.dev.vertex.connect, ABCDE12345.dev.vertex.connect.beta' })!;
    const [detail] = aasa.applinks.details;
    expect(detail!.appIDs).toEqual(['ABCDE12345.dev.vertex.connect', 'ABCDE12345.dev.vertex.connect.beta']);
    expect(detail!.components).toContainEqual({ '/': '/leads' });
    expect(detail!.components).toContainEqual({ '/': '/leads/*' });
    expect(aasa.webcredentials.apps).toEqual(detail!.appIDs);
  });

  it('never claims a public card or a chip, which open in the visitor’s browser', () => {
    for (const p of APP_PATHS) expect(p).not.toMatch(/^\/(c|t|tap|meet)(\/|$)/);
  });

  it('names the Android app and its signing certificate', () => {
    expect(assetLinks({ ANDROID_CERT_FINGERPRINTS: 'aa:bb:cc', ANDROID_PACKAGE: '' })).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
        target: { namespace: 'android_app', package_name: 'dev.vertex.connect', sha256_cert_fingerprints: ['AA:BB:CC'] },
      },
    ]);
  });
});
