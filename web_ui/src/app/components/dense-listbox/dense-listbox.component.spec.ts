import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Component, model, ViewChild } from '@angular/core';
import { DenseListboxComponent } from './dense-listbox.component';
import { DenseListboxItemComponent } from './dense-listbox-item.component';
import { By } from '@angular/platform-browser';

@Component({
  standalone: true,
  imports: [DenseListboxComponent, DenseListboxItemComponent],
  template: `
    <app-dense-listbox [(selected)]="selected">
      <app-dense-listbox-item [value]="1" [selected]="selected() === 1">Item 1</app-dense-listbox-item>
      <app-dense-listbox-item [value]="2" [selected]="selected() === 2">Item 2</app-dense-listbox-item>
      <app-dense-listbox-item [value]="3" [selected]="selected() === 3">Item 3</app-dense-listbox-item>
    </app-dense-listbox>
  `,
})
class TestHostComponent {
  @ViewChild(DenseListboxComponent) listbox!: DenseListboxComponent<number>;
  selected = model<number | undefined>(undefined);
}

describe('DenseListboxComponent', () => {
  let host: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, DenseListboxComponent, DenseListboxItemComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(host.listbox).toBeTruthy();
  });

  it('should have 3 items projected into it', () => {
    const items = fixture.debugElement.queryAll(By.directive(DenseListboxItemComponent));
    expect(items.length).toBe(3);
  });

  it('should select an item on click', () => {
    const itemElements = fixture.debugElement.queryAll(By.directive(DenseListboxItemComponent));
    itemElements[1].nativeElement.click();
    fixture.detectChanges();

    expect(host.selected()).toBe(2);
    expect(itemElements[1].componentInstance.selected()).toBeTrue();
    expect(itemElements[0].componentInstance.selected()).toBeFalse();
    expect(itemElements[2].componentInstance.selected()).toBeFalse();
  });

  it('should handle keyboard navigation (Down Arrow)', fakeAsync(() => {
    const listboxDebugEl = fixture.debugElement.query(By.directive(DenseListboxComponent));
    const listboxEl = listboxDebugEl.nativeElement;
    
    // Press ArrowDown
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    fixture.detectChanges();

    const itemElements = fixture.debugElement.queryAll(By.directive(DenseListboxItemComponent));
    expect(itemElements[0].componentInstance.active()).toBeTrue();

    // Press ArrowDown again
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    fixture.detectChanges();
    expect(itemElements[1].componentInstance.active()).toBeTrue();
    expect(itemElements[0].componentInstance.active()).toBeFalse();
  }));

  it('should select the active item on Enter', fakeAsync(() => {
    const listboxDebugEl = fixture.debugElement.query(By.directive(DenseListboxComponent));
    const listboxEl = listboxDebugEl.nativeElement;

    // Navigate to second item
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    fixture.detectChanges();

    // Press Enter
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    tick();
    fixture.detectChanges();

    expect(host.selected()).toBe(2);
  }));

  it('should select the active item on Space', fakeAsync(() => {
    const listboxDebugEl = fixture.debugElement.query(By.directive(DenseListboxComponent));
    const listboxEl = listboxDebugEl.nativeElement;

    // Navigate to third item
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    fixture.detectChanges();

    // Press Space
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
    tick();
    fixture.detectChanges();

    expect(host.selected()).toBe(3);
  }));

  it('should handle Home and End keys', fakeAsync(() => {
    const listboxDebugEl = fixture.debugElement.query(By.directive(DenseListboxComponent));
    const listboxEl = listboxDebugEl.nativeElement;

    const itemElements = fixture.debugElement.queryAll(By.directive(DenseListboxItemComponent));

    // Press End
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', keyCode: 35, bubbles: true }));
    tick();
    fixture.detectChanges();
    expect(itemElements[2].componentInstance.active()).toBeTrue();

    // Press Home
    listboxEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', keyCode: 36, bubbles: true }));
    tick();
    fixture.detectChanges();
    expect(itemElements[0].componentInstance.active()).toBeTrue();
  }));

  it('should update aria-activedescendant when active item changes', fakeAsync(() => {
    const listboxDebugEl = fixture.debugElement.query(By.directive(DenseListboxComponent));
    const innerListboxEl = listboxDebugEl.query(By.css('[role="listbox"]')).nativeElement;
    const itemElements = fixture.debugElement.queryAll(By.directive(DenseListboxItemComponent));
    const firstItemId = itemElements[0].nativeElement.id;

    listboxDebugEl.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    tick();
    fixture.detectChanges();

    expect(innerListboxEl.getAttribute('aria-activedescendant')).toBe(firstItemId);
  }));

  it('should sync active item with external selection changes', fakeAsync(() => {
    host.selected.set(3);
    tick();
    fixture.detectChanges();

    const itemElements = fixture.debugElement.queryAll(By.directive(DenseListboxItemComponent));
    expect(itemElements[2].componentInstance.active()).toBeTrue();
    expect(itemElements[0].componentInstance.active()).toBeFalse();
    expect(itemElements[1].componentInstance.active()).toBeFalse();
  }));
});
