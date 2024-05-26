package org.matrix.chromext.hook

import org.matrix.chromext.utils.*

object SpotifyHook : BaseHook() {
  var loader = this::class.java.classLoader!!

  override fun init() {

    val flag = loader.loadClass("com.spotify.connectivity.flags.Flag")
    val booleanFlag = loader.loadClass("com.spotify.connectivity.flags.BooleanFlag")
    val stringFlag = loader.loadClass("com.spotify.connectivity.flags.StringFlag")
    val loadedFlags = loader.loadClass("com.spotify.connectivity.flags.LoadedFlags")
    val productStateUtil =
        loader.loadClass("com.spotify.connectivity.productstate.ProductStateUtil")
    val productStateFlags =
        loader.loadClass("com.spotify.connectivity.productstate.ProductStateFlags")
    val sessionState =
        loader.loadClass("com.spotify.connectivity.sessionstate.AutoValue_SessionState")
    val playerState = loader.loadClass("com.spotify.player.model.AutoValue_PlayerState")
    val paymentState = loader.loadClass("com.spotify.connectivity.sessionstate.PaymentState")

    val getIdentifier = findMethod(flag) { name == "getIdentifier" }

    sessionState.declaredConstructors[0].hookAfter {
      val currentAccountType =
          findField(it.thisObject::class.java, true) { name == "currentAccountType" }
      val productType = findField(it.thisObject::class.java, true) { name == "productType" }
      val payment =
          findField(it.thisObject::class.java, true) { name == "paymentState" }.get(it.thisObject)
      val mSegments = findField(payment::class.java) { name == "mSegments" }
      productType.set(it.thisObject, "premium")
      currentAccountType.set(it.thisObject, 1)
      mSegments.set(payment, arrayOf("opt-in-trial"))
    }

    playerState.declaredConstructors[0].hookAfter {
      val contextRestrictions =
          findField(it.thisObject::class.java, true) { name == "contextRestrictions" }
              .get(it.thisObject)
      val restrictions = findField(it.thisObject::class.java, true) { name == "restrictions" }
      restrictions.set(it.thisObject, contextRestrictions)
    }

    // findMethod(booleanFlag) { name == "mapValue" }
    //     .hookBefore {
    //       val v = it.args[0] as String
    //       val identifier = getIdentifier.invoke(it.thisObject) as String
    //       Log.d("BooleanFlag mapValue ${identifier}: ${v}")
    //       when (identifier) {
    //         "nft-disabled" -> it.args[0] = "1"
    //       }
    //     }

    // findMethod(stringFlag) { name == "mapValue" }
    //     .hookBefore {
    //       val v = it.args[0] as String
    //       val identifier = getIdentifier.invoke(it.thisObject) as String
    //       Log.d("StringFlag mapValue ${identifier}: ${v}")
    //       when (identifier) {
    //         "type" -> it.args[0] = "premium"
    //         "on-demand-trial" -> it.args[0] = "active"
    //         "premium-tab-lock" -> it.args[0] = "0"
    //       }
    //     }

    findMethod(loadedFlags) { name == "get" && parameterTypes contentDeepEquals arrayOf(flag) }
        .hookAfter {
          val f = it.args[0]
          val identifier = getIdentifier.invoke(f) as String
          when (identifier) {
            "nft-disabled" -> it.result = true
          }
        }

    val onFlags =
        arrayOf(
            "onDemandEnabled",
            "isOfflineEnabled",
            "isPuffinEnabled",
            "isPigeonEnabled",
            "isPremium",
        )

    val offFlags =
        arrayOf(
            "isCatalogueFree",
            "isShuffleRestricted",
        )

    productStateUtil.declaredMethods
        .filter { onFlags.contains(it.name) }
        .forEach { it.hookBefore { it.result = true } }

    productStateUtil.declaredMethods
        .filter { offFlags.contains(it.name) }
        .forEach { it.hookBefore { it.result = false } }

    findMethod(productStateFlags) { name == "isShuffleRestricted" }.hookBefore { it.result = false }

    isInit = true
  }
}
