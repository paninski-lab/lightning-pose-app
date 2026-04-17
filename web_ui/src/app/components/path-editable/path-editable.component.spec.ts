import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PathEditableComponent } from './path-editable.component';
import { RpcService } from '../../rpc.service';
import { signal } from '@angular/core';

class MockRpcService {
  async call(method: string, params?: any): Promise<any> {
    if (method === 'rglob') {
      return {
        entries: [{ path: 'subdir', type: 'dir' }],
        relativeTo: params.baseDir,
      };
    }
    return {};
  }
}

describe('PathEditableComponent', () => {
  let component: PathEditableComponent;
  let fixture: ComponentFixture<PathEditableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PathEditableComponent],
      providers: [{ provide: RpcService, useClass: MockRpcService }],
    }).compileComponents();

    fixture = TestBed.createComponent(PathEditableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('path', '/home/user');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start editing with the current path', () => {
    component['startEditing']();
    expect(component['isEditing']()).toBeTrue();
    expect(component['editPath']()).toBe('/home/user');
  });

  it('should navigate when a breadcrumb is clicked', () => {
    component['startEditing']();
    const event = new MouseEvent('click');
    component['onPartClick']('/home', event);
    expect(component['editPath']()).toBe('/home');
  });

  it('should navigate when a subdirectory is selected', () => {
    component['startEditing']();
    component['onSubdirSelect']('newdir');
    expect(component['editPath']()).toBe('/home/user/newdir');
  });

  it('should append new directory name when in newDirMode and finished editing', () => {
    fixture.componentRef.setInput('newDirMode', true);
    component['startEditing']();
    component['newDirName'].set('new-folder');
    component['finishEditing']();
    expect(component.path()).toBe('/home/user/new-folder');
    expect(component['isEditing']()).toBeFalse();
  });

  it('should clear newDirName when navigating via breadcrumbs', () => {
    fixture.componentRef.setInput('newDirMode', true);
    component['startEditing']();
    component['newDirName'].set('something');
    const event = new MouseEvent('click');
    component['onPartClick']('/home', event);
    expect(component['newDirName']()).toBe('');
  });

  it('should clear newDirName when navigating via subdirectory selection', () => {
    fixture.componentRef.setInput('newDirMode', true);
    component['startEditing']();
    component['newDirName'].set('something');
    component['onSubdirSelect']('subdir');
    expect(component['newDirName']()).toBe('');
  });

  it('should handle root path correctly in newDirMode', () => {
    fixture.componentRef.setInput('path', '/');
    fixture.componentRef.setInput('newDirMode', true);
    fixture.detectChanges();
    component['startEditing']();
    component['newDirName'].set('rootfolder');
    component['finishEditing']();
    expect(component.path()).toBe('/rootfolder');
  });

  it('should open dropdown when subdirectories are found', async () => {
    component['startEditing']();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component['isDropdownOpen']()).toBeTrue();
  });

  it('should close dropdown when finishing editing', () => {
    component['startEditing']();
    component['isDropdownOpen'].set(true);
    component['finishEditing']();
    expect(component['isDropdownOpen']()).toBeFalse();
  });
});
