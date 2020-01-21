import _ from 'lodash'
import { policyFromString } from '../../common/track_policies/track_policy'
import { LabelTypeName, TrackPolicyType } from '../../common/types'
import { makeState } from '../../functional/states'
import { Label2DTemplateType, State } from '../../functional/types'
import { Context2D } from '../util'
import { Box2D } from './box2d'
import { CustomLabel2D } from './custom_label'
import { DrawMode, Label2D } from './label2d'
import { Node2D } from './node2d'
import { PathPoint2D } from './path_point2d'
import { Point2D } from './point2d'
import { Polygon2D } from './polygon2d'
import { Rect2D } from './rect2d'
import { Tag2D } from './tag2d'

/**
 * Make a new drawable label based on the label type
 * @param {string} labelType: type of the new label
 */
export function makeDrawableLabel2D (
  labelType: string,
  labelTemplates: { [name: string]: Label2DTemplateType }
): Label2D | null {
  if (labelType in labelTemplates) {
    return new CustomLabel2D(labelTemplates[labelType])
  }
  switch (labelType) {
    case LabelTypeName.BOX_2D:
      return new Box2D()
    case LabelTypeName.TAG:
      return new Tag2D()
    case LabelTypeName.POLYGON_2D:
      return new Polygon2D(true)
    case LabelTypeName.POLYLINE_2D:
      return new Polygon2D(false)
  }
  return null
}

type Shape2D = Node2D | PathPoint2D | Rect2D | Point2D

/**
 * List of drawable labels
 * ViewController for the labels
 */
export class Label2DList {
  /** label id to label drawable map */
  private _labels: {[labelId: number]: Label2D}
  /** shape id to shape drawable map */
  private _shapes: {[shapeId: number]: Shape2D}
  /** list of the labels sorted by label order */
  private _labelList: Label2D[]
  /** selected label */
  private _selectedLabels: Label2D[]
  /** state */
  private _state: State
  /** label templates */
  private _labelTemplates: { [name: string]: Label2DTemplateType }
  /** callbacks */
  private _callbacks: Array<() => void>

  constructor () {
    this._labels = {}
    this._shapes = {}
    this._labelList = []
    this._selectedLabels = []
    this._state = makeState()
    this._callbacks = []
    this._labelTemplates = {}
  }

  /**
   * Access the drawable label by index
   */
  public get (index: number): Label2D {
    return this._labelList[index]
  }

  /** Subscribe callback for drawable update */
  public subscribe (callback: () => void) {
    this._callbacks.push(callback)
  }

  /** Unsubscribe callback for drawable update */
  public unsubscribe (callback: () => void) {
    const index = this._callbacks.indexOf(callback)
    if (index >= 0) {
      this._callbacks.splice(index, 1)
    }
  }

  /** Call when any drawable has been updated */
  public onDrawableUpdate (): void {
    for (const callback of this._callbacks) {
      callback()
    }
  }

  /**
   * Get label by id
   * @param id
   */
  public getLabelById (id: number): Label2D {
    return this._labels[id]
  }

  /** get label list for state inspection */
  public get labelList (): Label2D[] {
    return this._labelList
  }

  /** get selectedLabel for state inspection */
  public get selectedLabels (): Label2D[] {
    return this._selectedLabels
  }

  /**
   * Get id's of selected labels
   */
  public get selectedLabelIds (): {[index: number]: number[]} {
    return this._state.user.select.labels
  }

  /**
   * Get current policy type
   */
  public get policyType (): TrackPolicyType {
    return policyFromString(
      this._state.task.config.policyTypes[this._state.user.select.policyType]
    )
  }

  /**
   * Draw label and control context
   * @param {Context2D} labelContext
   * @param {Context2D} controlContext
   * @param {number} ratio: ratio: display to image size ratio
   */
  public redraw (
      labelContext: Context2D,
      controlContext: Context2D,
      ratio: number,
      hideLabels?: boolean
    ): void {
    const labelsToDraw = (hideLabels) ?
      this._labelList.filter((label) => label.selected) :
      this._labelList
    labelsToDraw.forEach((v) => v.draw(labelContext, ratio, DrawMode.VIEW))
    labelsToDraw.forEach(
      (v) => v.draw(controlContext, ratio, DrawMode.CONTROL)
    )
  }

  /**
   * update labels from the state
   */
  public updateState (state: State): void {
    this._state = state
    this._labelTemplates = state.task.config.label2DTemplates
    const self = this
    const itemIndex = state.user.select.item
    const item = state.task.items[itemIndex]

    // remove any label not in the state
    self._labels = Object.assign({} as typeof self._labels,
        _.pick(self._labels, _.keys(item.labels)))

    // update drawable label values
    _.forEach(item.labels, (label, key) => {
      const labelId = Number(key)
      if (!(labelId in self._labels)) {
        const newLabel = makeDrawableLabel2D(label.type, this._labelTemplates)
        if (newLabel) {
          self._labels[labelId] = newLabel
        }
      }
      if (labelId in self._labels) {
        const drawableLabel = self._labels[labelId]
        if (!drawableLabel.editing) {
          drawableLabel.updateState(state, itemIndex, labelId)
        }
      }
    })

    // order the labels and assign order values
    self._labelList = _.sortBy(_.values(self._labels), [(label) => label.order])
    _.forEach(self._labelList,
      (l: Label2D, index: number) => { l.index = index })
    this._selectedLabels = []
    const select = state.user.select
    const selectedLabelItems = Object.keys(select.labels)
    for (const key of selectedLabelItems) {
      const index = Number(key)
      for (const id of select.labels[index]) {
        if (id in this._labels) {
          this._selectedLabels.push(this._labels[id])
        }
      }
    }
  }
}
