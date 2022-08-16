import type { ColumnType, LinkToAnotherRecordType, PaginatedType, TableType } from 'nocodb-sdk'
import type { ComputedRef, Ref } from 'vue'
import { Modal, message } from 'ant-design-vue'
import {
  NOCO,
  computed,
  extractSdkResponseErrorMsg,
  reactive,
  ref,
  useInjectionState,
  useMetas,
  useNuxtApp,
  useProject,
} from '#imports'
import type { Row } from '~/composables'

interface DataApiResponse {
  list: Record<string, any>
  pageInfo: PaginatedType
}

/** Store for managing Link to another cells */
const [useProvideLTARStore, useLTARStore] = useInjectionState(
  (column: Ref<Required<ColumnType>>, row: Ref<Row>, isNewRow: ComputedRef<boolean> | Ref<boolean>, reloadData = () => {}) => {
    // state
    const { metas, getMeta } = useMetas()
    const { project } = useProject()
    const { $api } = useNuxtApp()
    const childrenExcludedList = ref<DataApiResponse | undefined>()
    const childrenList = ref<DataApiResponse | undefined>()
    const childrenExcludedListPagination = reactive({
      page: 1,
      query: '',
      size: 10,
    })
    const childrenListPagination = reactive({
      page: 1,
      query: '',
      size: 10,
    })

    const colOptions = $computed(() => column?.value.colOptions as LinkToAnotherRecordType)

    // getters
    const meta = computed(() => metas?.value?.[column?.value?.fk_model_id as string])
    const relatedTableMeta = computed<TableType>(() => {
      return metas.value?.[colOptions?.fk_related_model_id as string]
    })

    const rowId = computed(() =>
      meta.value.columns
        .filter((c: Required<ColumnType>) => c.pk)
        .map((c: Required<ColumnType>) => row?.value?.row?.[c.title])
        .join('___'),
    )

    // actions
    const getRelatedTableRowId = (row: Record<string, any>) => {
      return relatedTableMeta.value?.columns
        ?.filter((c) => c.pk)
        .map((c) => row?.[c.title as string])
        .join('___')
    }

    const loadRelatedTableMeta = async () => {
      await getMeta(colOptions?.fk_related_model_id as string)
    }

    const relatedTablePrimaryValueProp = computed(() => {
      return (relatedTableMeta?.value?.columns?.find((c) => c.pv) || relatedTableMeta?.value?.columns?.[0])?.title
    })

    const relatedTablePrimaryKeyProps = computed(() => {
      return relatedTableMeta?.value?.columns?.filter((c) => c.pk)?.map((c) => c.title) ?? []
    })
    const primaryValueProp = computed(() => {
      return (meta?.value?.columns?.find((c: Required<ColumnType>) => c.pv) || relatedTableMeta?.value?.columns?.[0])?.title
    })

    const loadChildrenExcludedList = async () => {
      try {
        /** if new row load all records */
        if (isNewRow?.value) {
          childrenExcludedList.value = await $api.dbTableRow.list(
            NOCO,
            project.value.id as string,
            relatedTableMeta?.value?.id as string,
            {
              limit: childrenExcludedListPagination.size,
              offset: childrenExcludedListPagination.size * (childrenExcludedListPagination.page - 1),
              where:
                childrenExcludedListPagination.query &&
                `(${relatedTablePrimaryValueProp.value},like,${childrenExcludedListPagination.query})`,
              fields: [relatedTablePrimaryValueProp.value, ...relatedTablePrimaryKeyProps.value],
            } as any,
          )
        } else {
          childrenExcludedList.value = await $api.dbTableRow.nestedChildrenExcludedList(
            NOCO,
            project.value.id as string,
            meta.value.id,
            rowId.value,
            colOptions.type as 'mm' | 'hm',
            column?.value?.title,
            {
              limit: String(childrenExcludedListPagination.size),
              offset: String(childrenExcludedListPagination.size * (childrenExcludedListPagination.page - 1)),
              // todo: where clause is missing from type
              where:
                childrenExcludedListPagination.query &&
                `(${relatedTablePrimaryValueProp.value},like,${childrenExcludedListPagination.query})`,
            } as any,
          )
        }
      } catch (e: any) {
        message.error(`Failed to load list: ${await extractSdkResponseErrorMsg(e)}`)
      }
    }

    const loadChildrenList = async () => {
      try {
        if (colOptions.type === 'bt') return

        childrenList.value = await $api.dbTableRow.nestedList(
          NOCO,
          project.value.id as string,
          meta.value.id,
          rowId.value,
          colOptions.type as 'mm' | 'hm',
          column?.value?.title,
          {
            limit: String(childrenListPagination.size),
            offset: String(childrenListPagination.size * (childrenListPagination.page - 1)),
            where: childrenListPagination.query && `(${relatedTablePrimaryValueProp.value},like,${childrenListPagination.query})`,
          } as any,
        )
      } catch (e: any) {
        message.error(`Failed to load children list: ${await extractSdkResponseErrorMsg(e)}`)
      }
    }

    const deleteRelatedRow = async (row: Record<string, any>) => {
      Modal.confirm({
        title: 'Do you want to delete the record?',
        type: 'warning',
        onOk: async () => {
          const id = getRelatedTableRowId(row)
          try {
            $api.dbTableRow.delete(NOCO, project.value.id as string, relatedTableMeta.value.id as string, id as string)
            reloadData?.()
            await loadChildrenList()
          } catch (e: any) {
            message.error(`Delete failed: ${await extractSdkResponseErrorMsg(e)}`)
          }
        },
      })
    }

    const unlink = async (row: Record<string, any>) => {
      // const column = meta.columns.find(c => c.id === this.column.colOptions.fk_child_column_id);
      // todo: handle if new record
      // if (this.isNew) {
      //   this.$emit('updateCol', this.row, _cn, null);
      //   this.localState = null;
      //   this.$emit('update:localState', this.localState);
      //   return;
      // }
      // todo: handle bt column if required
      // if (column.rqd) {
      //   this.$toast.info('Unlink is not possible, instead map to another parent.').goAway(3000);
      //   return;
      // }
      try {
        // todo: audit
        await $api.dbTableRow.nestedRemove(
          NOCO,
          project.value.title as string,
          meta.value.title,
          rowId.value,
          colOptions.type as 'mm' | 'hm',
          column?.value?.title,
          getRelatedTableRowId(row) as string,
        )
      } catch (e: any) {
        message.error(`Unlink failed: ${await extractSdkResponseErrorMsg(e)}`)
      }
      reloadData?.()
      // todo: reload table data and children list
      // this.$emit('loadTableData');
      // if (this.isForm && this.$refs.childList) {
      //   this.$refs.childList.loadData();
      // }
    }

    const link = async (row: Record<string, any>) => {
      // todo: handle new record
      //   const pid = this._extractRowId(parent, this.parentMeta);
      // const id = this._extractRowId(this.row, this.meta);
      // const _cn = this.meta.columns.find(c => c.id === this.column.colOptions.fk_child_column_id).title;
      //
      // if (this.isNew) {
      //   const _rcn = this.parentMeta.columns.find(c => c.id === this.column.colOptions.fk_parent_column_id).title;
      //   this.localState = parent;
      //   this.$emit('update:localState', this.localState);
      //   this.$emit('updateCol', this.row, _cn, parent[_rcn]);
      //   this.newRecordModal = false;
      //   return;
      // }
      try {
        await $api.dbTableRow.nestedAdd(
          NOCO,
          project.value.title as string,
          meta.value.title as string,
          rowId.value,
          colOptions.type as 'mm' | 'hm',
          column?.value?.title,
          getRelatedTableRowId(row) as string,
        )
        await loadChildrenList()
      } catch (e: any) {
        message.error(`Linking failed: ${await extractSdkResponseErrorMsg(e)}`)
      }

      // todo: reload table data and child list
      // this.pid = pid;
      //
      // this.newRecordModal = false;
      //
      // this.$emit('loadTableData');
      // if (this.isForm && this.$refs.childList) {
      //   this.$refs.childList.loadData();
      // }

      reloadData?.()
    }

    // watchers
    watch(childrenExcludedListPagination, async () => {
      await loadChildrenExcludedList()
    })
    watch(childrenListPagination, async () => {
      await loadChildrenList()
    })

    return {
      relatedTableMeta,
      loadRelatedTableMeta,
      relatedTablePrimaryValueProp,
      childrenExcludedList,
      childrenList,
      rowId,
      childrenExcludedListPagination,
      childrenListPagination,
      primaryValueProp,
      meta,
      unlink,
      link,
      loadChildrenExcludedList,
      loadChildrenList,
      row,
      deleteRelatedRow,
      getRelatedTableRowId,
    }
  },
  'ltar-store',
)

export { useProvideLTARStore }

export function useLTARStoreOrThrow() {
  const ltarStore = useLTARStore()
  if (ltarStore == null) throw new Error('Please call `useLTARStore` on the appropriate parent component')
  return ltarStore
}
