import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { OnvifDiscoveryService } from './onvif-discovery.service';

function makeService() {
  const config = {
    get: <T>(_key: string, fallback?: T) => fallback as T,
  };
  return new OnvifDiscoveryService(config as never);
}

describe('OnvifDiscoveryService', () => {
  it('builds distinct namespace-aware probes', () => {
    const service = makeService() as any;
    const first = service.buildProbe('<d:Types>tds:Device</d:Types>');
    const second = service.buildProbe('<d:Types>dn:NetworkVideoTransmitter</d:Types>');
    assert.match(first, /tds:Device/);
    assert.match(second, /dn:NetworkVideoTransmitter/);
    assert.notEqual(first, second);
  });

  it('parses discovery XML without depending on vendor prefixes', () => {
    const service = makeService() as any;
    const result = service.parseDiscoveryResponse(
      '192.168.2.127',
      `<soap:Envelope xmlns:soap="urn:soap" xmlns:x="urn:discovery">
        <soap:Body><x:ProbeMatch>
          <x:XAddrs>http://192.168.2.127:8899/onvif/device_service</x:XAddrs>
          <x:Scopes>onvif://www.onvif.org/name/Front%20Gate
            onvif://www.onvif.org/manufacturer/Tiandy
            onvif://www.onvif.org/hardware/TC-H342N</x:Scopes>
        </x:ProbeMatch></soap:Body>
      </soap:Envelope>`,
    );
    assert.deepEqual(
      {
        ip: result.ip,
        serviceUrl: result.serviceUrl,
        name: result.name,
        manufacturer: result.manufacturer,
        model: result.model,
      },
      {
        ip: '192.168.2.127',
        serviceUrl: 'http://192.168.2.127:8899/onvif/device_service',
        name: 'Front Gate',
        manufacturer: 'Tiandy',
        model: 'TC-H342N',
      },
    );
  });

  it('deduplicates devices discovered from multiple Windows adapters', async () => {
    const service = makeService() as any;
    service.localIpv4Addresses = () => ['192.168.1.10', '192.168.2.10'];
    service.scanInterface = async () => [
      {
        ip: '192.168.1.102',
        serviceUrl: 'http://192.168.1.102/onvif/device_service',
        name: 'Camera',
      },
    ];
    const result = await service.scan({ timeoutMs: 500 });
    assert.equal(result.length, 1);
    assert.equal(result[0].ip, '192.168.1.102');
  });

  it('rejects an ONVIF service URL targeting another host before network access', async () => {
    const service = makeService();
    await assert.rejects(
      service.fetchProfiles({
        ip: '192.168.2.127',
        serviceUrl: 'http://192.168.2.128/onvif/device_service',
      }),
      BadRequestException,
    );
  });
});
