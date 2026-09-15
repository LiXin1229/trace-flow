import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  isNonEmptyString,
  isAbsolutePath,
  isValidLine,
  validateData
} from './validate.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 实际存在的 skill 根目录（绝对路径），用于 projectRoot
const projectRoot = path.resolve(__dirname, '..')

function makeNode(overrides = {}) {
  return {
    id: '1',
    name: 'foo',
    filepath: 'src/foo.js',
    line: '#L1-L5',
    oneLineSummary: '测试函数',
    snippetIntents: [],
    ...overrides
  }
}

function makeSnippet(overrides = {}) {
  return {
    content: '调用 bar',
    line: '#L2',
    associatedId: null,
    associatedType: null,
    associatedRequired: false,
    ...overrides
  }
}

describe('isNonEmptyString', () => {
  it('正常字符串返回 true', () => {
    expect(isNonEmptyString('abc')).toBe(true)
  })

  it('空字符串、空白、非字符串返回 false', () => {
    expect(isNonEmptyString('')).toBe(false)
    expect(isNonEmptyString('   ')).toBe(false)
    expect(isNonEmptyString(1)).toBe(false)
    expect(isNonEmptyString(null)).toBe(false)
    expect(isNonEmptyString(undefined)).toBe(false)
  })
})

describe('isAbsolutePath', () => {
  it('识别 Windows 盘符 / UNC / POSIX 绝对路径', () => {
    expect(isAbsolutePath('d:/foo/bar')).toBe(true)
    expect(isAbsolutePath('D:\\foo\\bar')).toBe(true)
    expect(isAbsolutePath('//server/share')).toBe(true)
    expect(isAbsolutePath('\\\\server\\share')).toBe(true)
    expect(isAbsolutePath('/foo/bar')).toBe(true)
  })

  it('相对路径返回 false', () => {
    expect(isAbsolutePath('src/foo.js')).toBe(false)
    expect(isAbsolutePath('foo.js')).toBe(false)
    expect(isAbsolutePath('./foo.js')).toBe(false)
    expect(isAbsolutePath('')).toBe(false)
  })

  it('非字符串返回 false', () => {
    expect(isAbsolutePath(123)).toBe(false)
  })
})

describe('isValidLine', () => {
  it('接受 #L<n> 与 #L<n>-L<n>', () => {
    expect(isValidLine('#L10')).toBe(true)
    expect(isValidLine('#L10-L20')).toBe(true)
  })

  it('拒绝非法格式', () => {
    expect(isValidLine('L10')).toBe(false)
    expect(isValidLine('#L')).toBe(false)
    expect(isValidLine('#L10-20')).toBe(false)
    expect(isValidLine('#L10-L')).toBe(false)
    expect(isValidLine('')).toBe(false)
    expect(isValidLine(10)).toBe(false)
  })
})

describe('validateData', () => {
  it('合法数据返回空错误列表', () => {
    const data = {
      projectRoot,
      nodes: [makeNode({ snippetIntents: [makeSnippet()] })]
    }
    expect(validateData(data)).toEqual([])
  })

  it('顶层必须是对象', () => {
    expect(validateData(null).some((e) => e.includes('顶层'))).toBe(true)
    expect(validateData([]).some((e) => e.includes('顶层'))).toBe(true)
  })

  it('projectRoot 必须是非空绝对路径且目录存在', () => {
    const notExist = path.resolve(__dirname, '__nonexistent_dir__')
    expect(
      validateData({ projectRoot: 'relative/path', nodes: [] }).some((e) =>
        e.includes('projectRoot 必须是绝对路径')
      )
    ).toBe(true)
    expect(
      validateData({ projectRoot: notExist, nodes: [] }).some((e) =>
        e.includes('projectRoot 目录不存在')
      )
    ).toBe(true)
  })

  it('nodes 必须是数组', () => {
    expect(
      validateData({ projectRoot, nodes: 'x' }).some((e) => e.includes('必须是数组'))
    ).toBe(true)
  })

  it('节点缺少必需字段时报错', () => {
    const data = { projectRoot, nodes: [{ id: '1' }] }
    expect(validateData(data).some((e) => e.includes('缺少必需字段'))).toBe(true)
  })

  it('id 必须是非空字符串', () => {
    const data = { projectRoot, nodes: [makeNode({ id: 1 })] }
    expect(validateData(data).some((e) => e.includes('.id 必须是非空字符串'))).toBe(true)
  })

  it('id 允许任意非空字符串，但必须唯一', () => {
    // 非数字字符串 id 也合法
    expect(validateData({ projectRoot, nodes: [makeNode({ id: 'foo' })] })).toEqual([])

    // 重复 id 报错
    const data = {
      projectRoot,
      nodes: [makeNode({ id: '1' }), makeNode({ id: '1' })]
    }
    expect(validateData(data).some((e) => e.includes('id 重复'))).toBe(true)
  })

  it('filepath 不能是绝对路径', () => {
    const data = { projectRoot, nodes: [makeNode({ filepath: '/abs.js' })] }
    expect(validateData(data).some((e) => e.includes('必须是相对'))).toBe(true)
  })

  it('line 格式非法时报错', () => {
    const data = { projectRoot, nodes: [makeNode({ line: 'L10' })] }
    expect(validateData(data).some((e) => e.includes('line 格式非法'))).toBe(true)
  })

  it('snippetIntents 必须是数组', () => {
    const data = { projectRoot, nodes: [makeNode({ snippetIntents: 'x' })] }
    expect(validateData(data).some((e) => e.includes('snippetIntents 必须是数组'))).toBe(true)
  })

  it('associatedType 必须是合法枚举', () => {
    const data = {
      projectRoot,
      nodes: [
        makeNode({
          snippetIntents: [makeSnippet({ associatedId: '1', associatedType: 'bad' })]
        })
      ]
    }
    expect(validateData(data).some((e) => e.includes('associatedType 必须是'))).toBe(true)
  })

  it('associatedRequired 必须是 boolean', () => {
    const data = {
      projectRoot,
      nodes: [makeNode({ snippetIntents: [makeSnippet({ associatedRequired: 'yes' })] })]
    }
    expect(validateData(data).some((e) => e.includes('associatedRequired 必须是 boolean'))).toBe(true)
  })

  it('associatedId 为 null 时 type 必须 null、required 必须 false', () => {
    const data = {
      projectRoot,
      nodes: [makeNode({ snippetIntents: [makeSnippet({ associatedId: null, associatedType: 'call' })] })]
    }
    expect(validateData(data).some((e) => e.includes('associatedId 为 null 时 associatedType 必须为 null'))).toBe(true)

    const data2 = {
      projectRoot,
      nodes: [makeNode({ snippetIntents: [makeSnippet({ associatedId: null, associatedRequired: true })] })]
    }
    expect(validateData(data2).some((e) => e.includes('associatedId 为 null 时 associatedRequired 必须为 false'))).toBe(true)
  })

  it('associatedId 非 null 时 type 不能为 null', () => {
    const data = {
      projectRoot,
      nodes: [
        makeNode({ id: '1', snippetIntents: [makeSnippet({ associatedId: '2', associatedType: null })] }),
        makeNode({ id: '2' })
      ]
    }
    expect(validateData(data).some((e) => e.includes('associatedId 非 null 时 associatedType 不能为 null'))).toBe(true)
  })

  it('associatedId 引用不存在的 id 时报错', () => {
    const data = {
      projectRoot,
      nodes: [makeNode({ id: '1', snippetIntents: [makeSnippet({ associatedId: '99', associatedType: 'call' })] })]
    }
    expect(validateData(data).some((e) => e.includes('引用了不存在的 id "99"'))).toBe(true)
  })
})
